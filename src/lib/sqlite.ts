import { execFileSync } from 'node:child_process';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');

type QueryPayload = {
  kind: 'query' | 'execute';
  sql: string;
  params: unknown[];
};

function runSql<T>(payload: QueryPayload): T {
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
        print(json.dumps({"lastrowid": cur.lastrowid, "changes": cur.rowcount}, default=str))
finally:
    conn.close()
`;

  const output = execFileSync('python3', ['-c', script, dbPath, JSON.stringify(payload)], {
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
