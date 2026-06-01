import { execFileSync } from 'node:child_process';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL;
const sqliteDbPath = path.join(process.cwd(), 'prisma', 'dev.db');

type QueryPayload = {
  kind: 'query' | 'execute';
  sql: string;
  params: unknown[];
};

function toPgSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function runSql<T>(payload: QueryPayload): T {
  const convertedPayload = JSON.stringify({
    ...payload,
    sql: toPgSql(payload.sql),
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
  return runSql<{ lastrowid: number; changes: number }>({ kind: 'execute', sql, params });
}
