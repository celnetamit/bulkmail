import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads';

const databaseUrl = process.env.DATABASE_URL;
const sqliteDbPath = path.join(process.cwd(), 'prisma', 'dev.db');

type QueryPayload = {
  kind: 'query' | 'execute';
  sql: string;
  params: unknown[];
};

type SqlExecuteResult = {
  rowCount?: number;
  changes?: number;
  lastrowid?: number;
};

function toPgSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

const postgresIdentifiersToQuote = [
  'isActive',
  'isDefaultTestList',
  'isArchived',
  'userId',
  'teamId',
  'managerId',
  'campaignId',
  'listId',
  'contactId',
  'templateId',
  'dailyCreditLimit',
  'allocatedDailyLimit',
  'dailyEmailLimit',
  'imageUploadLimitKb',
  'senderFromName',
  'senderFromEmail',
  'senderReplyToEmail',
  'sendingDomain',
  'spfVerified',
  'dkimVerified',
  'dmarcVerified',
  'isEnabled',
  'runEveryMinutes',
  'auditLogRetentionDays',
  'systemEventRetentionDays',
  'sendJobRetentionDays',
  'autoArchiveCampaignDays',
  'archivedCampaignRetentionDays',
  'lockToken',
  'lockExpiresAt',
  'lastStartedAt',
  'lastFinishedAt',
  'lastStatus',
  'lastTriggeredBy',
  'lastSummaryJson',
  'lastLoginAt',
  'createdAt',
  'updatedAt',
  'totalRecipients',
  'sentCount',
  'failedCount',
  'skippedCount',
  'startedAt',
  'finishedAt',
  'durationSeconds',
  'scopeType',
  'eventType',
  'cpuUserMs',
  'cpuSystemMs',
  'memoryRssMb',
  'memoryHeapUsedMb',
  'memoryHeapTotalMb',
  'eventLoopUtilization',
  'activeHandles',
  'activeRequests',
  'loadAverage1m',
  'loadAverage5m',
  'loadAverage15m',
  'recipientCount',
  'durationMs',
  'note',
  'bodyHtml',
  'firstName',
  'lastName',
  'awsRegion',
  'awsFromEmail',
  'awsAccessKeyIdEncrypted',
  'awsSecretAccessKeyEncrypted',
  'awsSessionTokenEncrypted',
  'resendApiKeyEncrypted',
  'resendFromEmail',
  'webhookSharedSecretEncrypted',
  'providerEventId',
  'providerMessageId',
  'agentKey',
  'apiKeyEncrypted',
  'systemPrompt',
  'maxOutputTokens',
  'isEnabled',
  'conversationId',
  'metadataJson',
  'lastMessageAt',
  'profileKey',
  'baseUrl',
  'temperature',
  'label',
  'description',
] as const;

function quotePostgresIdentifiers(sql: string) {
  return postgresIdentifiersToQuote.reduce((currentSql, identifier) => {
    const pattern = new RegExp(`(?<!["\\w])${identifier}(?!["\\w])`, 'g');
    return currentSql.replace(pattern, `"${identifier}"`);
  }, sql);
}

/**
 * ---------------------------------------------------------------------------
 * Pooled synchronous Postgres access
 * ---------------------------------------------------------------------------
 * Historically every query spawned a brand new `node` child process that
 * created (and tore down) its own pg Pool — i.e. one OS process + one TCP
 * connect + auth handshake PER QUERY. That dominated request latency.
 *
 * Instead we run a single long-lived worker thread that owns a persistent,
 * pooled pg connection, and block the calling thread on the result using
 * `Atomics.wait` over a SharedArrayBuffer. This keeps the existing SYNCHRONOUS
 * `queryRow`/`queryRows`/`executeSql` contract (no caller changes) while
 * eliminating the per-query process spawn and reusing connections.
 *
 * The data in/out is byte-identical to the legacy child process (same converted
 * SQL, same `JSON.stringify(rows)` / `{rowCount}` payloads), so results are
 * unchanged. If the worker cannot start or an infrastructure failure occurs,
 * we transparently fall back to the legacy child-process path and never use the
 * worker again, so behaviour degrades safely to exactly what it was before.
 * Set DB_SYNC_WORKER=0 to force the legacy path.
 */
const WORKER_QUERY_TIMEOUT_MS = 30_000;

const POOLED_WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: workerData.databaseUrl });
pool.on('error', () => {});
parentPort.on('message', async (msg) => {
  const flag = new Int32Array(msg.sab);
  const port = msg.port;
  let response;
  try {
    const payload = JSON.parse(msg.payloadJson);
    const result = await pool.query(payload.sql, payload.params || []);
    response = {
      ok: true,
      output: payload.kind === 'query'
        ? JSON.stringify(result.rows)
        : JSON.stringify({ rowCount: result.rowCount }),
    };
  } catch (err) {
    response = { ok: false, error: err && err.message ? err.message : String(err) };
  }
  try { port.postMessage(response); } catch (postError) {}
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
`;

class DbWorkerInfraError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'DbWorkerInfraError';
  }
}

let pooledWorker: Worker | null = null;
let workerDisabled = false;

function pooledWorkerEnabled() {
  if (process.env.DB_SYNC_WORKER === '0') return false;
  return !workerDisabled;
}

function disablePooledWorker(error: unknown) {
  if (workerDisabled) return;
  workerDisabled = true;
  console.error('db_sync_worker_disabled_fallback_to_child_process', {
    error: error instanceof Error ? error.message : String(error),
  });
  try {
    pooledWorker?.terminate();
  } catch {
    // ignore
  }
  pooledWorker = null;
}

function ensurePooledWorker(): Worker {
  if (pooledWorker) return pooledWorker;
  try {
    const worker = new Worker(POOLED_WORKER_SOURCE, {
      eval: true,
      workerData: { databaseUrl },
    });
    worker.on('error', (error) => disablePooledWorker(error));
    worker.on('exit', (code) => {
      pooledWorker = null;
      if (code !== 0) disablePooledWorker(new Error(`DB worker exited with code ${code}`));
    });
    worker.unref();
    pooledWorker = worker;
    return worker;
  } catch (error) {
    throw new DbWorkerInfraError('Failed to start DB worker', error);
  }
}

function runViaPooledWorker(payloadJson: string): string {
  const worker = ensurePooledWorker();
  const sab = new SharedArrayBuffer(4);
  const flag = new Int32Array(sab);
  const { port1, port2 } = new MessageChannel();

  try {
    worker.postMessage({ payloadJson, sab, port: port2 }, [port2]);
  } catch (error) {
    port1.close();
    throw new DbWorkerInfraError('Failed to dispatch query to DB worker', error);
  }

  const waitResult = Atomics.wait(flag, 0, 0, WORKER_QUERY_TIMEOUT_MS);
  if (waitResult === 'timed-out') {
    port1.close();
    throw new DbWorkerInfraError('DB worker query timed out');
  }

  const received = receiveMessageOnPort(port1);
  port1.close();
  if (!received) {
    throw new DbWorkerInfraError('DB worker returned no response');
  }

  const response = received.message as { ok: boolean; output?: string; error?: string };
  if (!response.ok) {
    // A genuine query error (bad SQL, constraint violation, etc.) — propagate it
    // exactly like the legacy child process did on non-zero exit, and keep the
    // worker alive for subsequent queries.
    throw new Error(response.error || 'Database query failed.');
  }
  return response.output || '';
}

function runSql<T>(payload: QueryPayload): T {
  const convertedPayload = JSON.stringify({
    ...payload,
    sql: toPgSql(quotePostgresIdentifiers(payload.sql)),
    params: payload.params.map((value) => (value === undefined ? null : value)),
  });

  if (!databaseUrl) {
    const script = `
import json
import sqlite3
import sys

db_path = sys.argv[1]
payload = json.loads(sys.argv[2])

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
try:
    cur = conn.cursor()
    cur.execute(payload["sql"], payload.get("params", []))
    if payload["kind"] == "query":
        rows = [dict(row) for row in cur.fetchall()]
        print(json.dumps(rows, default=str))
    else:
        conn.commit()
        print(json.dumps({"rowCount": cur.rowcount}, default=str))
finally:
    conn.close()
`;

    const output = execFileSync('python3', ['-c', script, sqliteDbPath, JSON.stringify(payload)], {
      encoding: 'utf8',
    }).trim();

    return output ? (JSON.parse(output) as T) : (undefined as T);
  }

  // Fast path: persistent worker with a pooled pg connection.
  if (pooledWorkerEnabled()) {
    try {
      const workerOutput = runViaPooledWorker(convertedPayload);
      return workerOutput ? (JSON.parse(workerOutput) as T) : (undefined as T);
    } catch (error) {
      if (error instanceof DbWorkerInfraError) {
        disablePooledWorker(error);
        // fall through to the legacy child-process path below
      } else {
        throw error;
      }
    }
  }

  // Legacy fallback: spawn a one-shot child process per query.
  const script = `
const { Pool } = require('pg');

const databaseUrl = process.argv[1];
const payload = JSON.parse(process.argv[2]);

const pool = new Pool({ connectionString: databaseUrl });

(async () => {
  try {
    const result = await pool.query(payload.sql, payload.params || []);
    if (payload.kind === 'query') {
      process.stdout.write(JSON.stringify(result.rows, null, 0));
    } else {
      process.stdout.write(JSON.stringify({ rowCount: result.rowCount }, null, 0));
    }
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

  const output = execFileSync('node', ['-e', script, databaseUrl, convertedPayload], {
    encoding: 'utf8',
  }).trim();

  return output ? (JSON.parse(output) as T) : (undefined as T);
}

export function queryRows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return runSql<T[]>({ kind: 'query', sql, params });
}

export function queryRow<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const rows = queryRows<T>(sql, params);
  return rows[0] || null;
}

export function executeSql(sql: string, params: unknown[] = []) {
  return runSql<SqlExecuteResult>({ kind: 'execute', sql, params });
}
