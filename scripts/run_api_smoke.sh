#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f ".env.local" ]; then
  eval "$(
    python3 - <<'PY'
from pathlib import Path
import shlex

for raw in Path('.env.local').read_text(encoding='utf-8').splitlines():
    line = raw.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue

    key, value = line.split('=', 1)
    key = key.strip()
    value = value.strip()

    if not key:
        continue

    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]

    print(f'export {key}={shlex.quote(value)}')
PY
  )"
fi

SMOKE_BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
unset BASE_URL
AUTH_SECRET="${AUTH_SECRET:-dev-insecure-auth-secret-change-in-prod}"
TEST_PREFIX="${TEST_PREFIX:-smoke-$(date +%s)-$$}"
SMOKE_EMAIL="${SMOKE_EMAIL:-${TEST_PREFIX}@example.com}"
SMOKE_NAME="${SMOKE_NAME:-Smoke Admin}"

if [[ "$SMOKE_BASE_URL" == http://localhost:* ]]; then
  SMOKE_BASE_URL="http://127.0.0.1:${SMOKE_BASE_URL##*:}"
elif [[ "$SMOKE_BASE_URL" == https://localhost:* ]]; then
  SMOKE_BASE_URL="https://127.0.0.1:${SMOKE_BASE_URL##*:}"
elif [[ "$SMOKE_BASE_URL" == http://0.0.0.0:* ]]; then
  SMOKE_BASE_URL="http://127.0.0.1:${SMOKE_BASE_URL##*:}"
elif [[ "$SMOKE_BASE_URL" == https://0.0.0.0:* ]]; then
  SMOKE_BASE_URL="https://127.0.0.1:${SMOKE_BASE_URL##*:}"
fi

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

json_parse() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

path = sys.argv[1]
payload = json.load(open(sys.argv[2], encoding='utf-8'))

current = payload
for part in path.split('.'):
    if isinstance(current, list):
        current = current[int(part)]
    else:
        current = current[part]

if isinstance(current, (dict, list)):
    print(json.dumps(current))
elif current is None:
    print('')
else:
    print(current)
PY
}

request_json() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local extra_headers=("${@:4}")

  rm -f "$BODY_FILE"
  if [ -n "$data" ]; then
    curl -sS -o "$BODY_FILE" -w '%{http_code}' \
      -H "Cookie: mailflow_session=${SESSION_TOKEN}" \
      -H 'content-type: application/json' \
      "${extra_headers[@]}" \
      -X "$method" \
      -d "$data" \
      "$SMOKE_BASE_URL$path"
  else
    curl -sS -o "$BODY_FILE" -w '%{http_code}' \
      -H "Cookie: mailflow_session=${SESSION_TOKEN}" \
      "${extra_headers[@]}" \
      -X "$method" \
      "$SMOKE_BASE_URL$path"
  fi
}

seed_user_sqlite() {
  python3 - "$SMOKE_EMAIL" "$SMOKE_NAME" <<'PY'
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timezone

email = sys.argv[1].strip().lower()
name = sys.argv[2].strip()
db_path = os.path.join(os.getcwd(), 'prisma', 'dev.db')

conn = sqlite3.connect(db_path)
try:
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    user = cur.execute('SELECT id FROM "User" WHERE lower(email) = lower(?) LIMIT 1', [email]).fetchone()
    user_id = user['id'] if user else uuid.uuid4().hex
    timestamp = datetime.now(timezone.utc).isoformat()
    password = f'provisioned-{user_id}'

    cur.execute(
        '''
        INSERT INTO "User" (
          id, email, name, password, role, isActive, dailyEmailLimit, imageUploadLimitKb,
          lastLoginAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          name = excluded.name,
          role = excluded.role,
          isActive = excluded.isActive,
          dailyEmailLimit = excluded.dailyEmailLimit,
          imageUploadLimitKb = excluded.imageUploadLimitKb,
          updatedAt = CURRENT_TIMESTAMP
        ''',
        [user_id, email, name or None, password, 'ADMIN', 1, 100000, 50, None, timestamp, timestamp],
    )

    cur.execute(
        '''
        INSERT INTO "MailSettings" (
          id, userId, provider, createdAt, updatedAt
        ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(userId) DO UPDATE SET
          provider = excluded.provider,
          updatedAt = CURRENT_TIMESTAMP
        ''',
        [uuid.uuid4().hex, user_id, 'mock'],
    )

    conn.commit()
    print(user_id)
finally:
    conn.close()
PY
}

seed_user_postgres() {
  node - "$SMOKE_EMAIL" "$SMOKE_NAME" <<'NODE'
const { Pool } = require('pg');
const crypto = require('node:crypto');

const email = String(process.argv[2] || '').trim().toLowerCase();
const name = String(process.argv[3] || '').trim();
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Postgres smoke seeding.');
}

(async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const userId = crypto.randomUUID().replace(/-/g, '');
    const createdAt = new Date().toISOString();
    const password = `provisioned-${userId}`;

    await pool.query(
      `
        INSERT INTO "User" (
          id, email, name, password, role, isActive, dailyEmailLimit, imageUploadLimitKb,
          lastLoginAt, createdAt, updatedAt
        ) VALUES ($1, $2, $3, $4, 'ADMIN', TRUE, 100000, 50, NULL, $5, $5)
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          isActive = EXCLUDED.isActive,
          dailyEmailLimit = EXCLUDED.dailyEmailLimit,
          imageUploadLimitKb = EXCLUDED.imageUploadLimitKb,
          updatedAt = CURRENT_TIMESTAMP
      `,
      [userId, email, name || null, password, createdAt],
    );

    await pool.query(
      `
        INSERT INTO "MailSettings" (
          id, userId, provider, createdAt, updatedAt
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (userId) DO UPDATE SET
          provider = EXCLUDED.provider,
          updatedAt = CURRENT_TIMESTAMP
      `,
      [crypto.randomUUID(), userId, 'mock'],
    );

    process.stdout.write(userId);
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
}

if [ -n "${DATABASE_URL:-}" ]; then
  SMOKE_USER_ID="$(seed_user_postgres)"
else
  SMOKE_USER_ID="$(seed_user_sqlite)"
fi

SESSION_TOKEN="$(node --input-type=module - "$AUTH_SECRET" "$SMOKE_USER_ID" "$SMOKE_EMAIL" <<'NODE'
import { SignJWT } from 'jose';

const secret = String(process.argv[2] || 'dev-insecure-auth-secret-change-in-prod');
const userId = String(process.argv[3] || '');
const email = String(process.argv[4] || '');

const token = await new SignJWT({ userId, email })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('7d')
  .sign(new TextEncoder().encode(secret));

process.stdout.write(token);
NODE
)"
export SESSION_TOKEN

echo "[1/11] auth me"
AUTH_STATUS="$(request_json GET /api/auth/me)"
if [ "$AUTH_STATUS" != "200" ]; then
  echo "auth/me request failed"
  cat "$BODY_FILE"
  exit 1
fi

AUTH_BODY="$(cat "$BODY_FILE")"
if ! printf '%s' "$AUTH_BODY" | grep -q "\"email\":\"$SMOKE_EMAIL\""; then
  echo "auth/me did not return the seeded user"
  cat "$BODY_FILE"
  exit 1
fi

echo "[2/11] create default test list"
LIST_A_STATUS="$(request_json POST /api/lists "{\"name\":\"Smoke Test List A\",\"description\":\"Default test list for smoke checks\",\"isDefaultTestList\":true}")"
if [ "$LIST_A_STATUS" != "201" ]; then
  echo "create list A failed ($LIST_A_STATUS)"
  cat "$BODY_FILE"
  exit 1
fi
LIST_A_ID="$(json_parse list.id "$BODY_FILE")"

echo "[3/11] create secondary list"
LIST_B_STATUS="$(request_json POST /api/lists "{\"name\":\"Smoke Customer List B\",\"description\":\"Secondary send target\"}")"
if [ "$LIST_B_STATUS" != "201" ]; then
  echo "create list B failed ($LIST_B_STATUS)"
  cat "$BODY_FILE"
  exit 1
fi
LIST_B_ID="$(json_parse list.id "$BODY_FILE")"

echo "[4/11] add contacts"
for payload in \
  "{\"listId\":\"$LIST_A_ID\",\"email\":\"s1@example.com\",\"firstName\":\"Smoke\",\"lastName\":\"One\"}" \
  "{\"listId\":\"$LIST_A_ID\",\"email\":\"s2@example.com\",\"firstName\":\"Smoke\",\"lastName\":\"Two\"}" \
  "{\"listId\":\"$LIST_B_ID\",\"email\":\"s3@example.com\",\"firstName\":\"Smoke\",\"lastName\":\"Three\"}"
do
  CONTACT_STATUS="$(request_json POST /api/contacts "$payload")"
  if [ "$CONTACT_STATUS" != "201" ]; then
    echo "create contact failed ($CONTACT_STATUS)"
    cat "$BODY_FILE"
    exit 1
  fi
done

echo "[5/11] create template"
TEMPLATE_STATUS="$(request_json POST /api/templates "{\"name\":\"Smoke Template\",\"subject\":\"Smoke Template Subject\",\"bodyHtml\":\"<html><body><p>Template body</p></body></html>\"}")"
if [ "$TEMPLATE_STATUS" != "201" ]; then
  echo "create template failed ($TEMPLATE_STATUS)"
  cat "$BODY_FILE"
  exit 1
fi
TEMPLATE_ID="$(json_parse template.id "$BODY_FILE")"

echo "[6/11] create campaign with multi-list selection"
CAMPAIGN_STATUS="$(request_json POST /api/campaigns "{\"name\":\"Smoke Campaign\",\"subject\":\"Smoke Subject\",\"bodyHtml\":\"<html><body><p>Hello Smoke</p></body></html>\",\"templateId\":\"$TEMPLATE_ID\",\"listIds\":[\"$LIST_A_ID\",\"$LIST_B_ID\"]}")"
if [ "$CAMPAIGN_STATUS" != "201" ]; then
  echo "create campaign failed ($CAMPAIGN_STATUS)"
  cat "$BODY_FILE"
  exit 1
fi
CAMPAIGN_ID="$(json_parse campaign.id "$BODY_FILE")"

echo "[7/11] test campaign against default test list"
TEST_STATUS="$(request_json POST "/api/campaigns/$CAMPAIGN_ID/test")"
if [ "$TEST_STATUS" != "200" ]; then
  echo "test send failed ($TEST_STATUS)"
  cat "$BODY_FILE"
  exit 1
fi
TEST_SENT_COUNT="$(json_parse sentCount "$BODY_FILE")"
if [ "${TEST_SENT_COUNT:-0}" -lt 1 ]; then
  echo "test send did not reach any contact"
  cat "$BODY_FILE"
  exit 1
fi

echo "[8/11] queue full campaign send"
SEND_STATUS="$(request_json POST "/api/campaigns/$CAMPAIGN_ID/send")"
if [ "$SEND_STATUS" != "202" ] && [ "$SEND_STATUS" != "200" ]; then
  echo "campaign send failed ($SEND_STATUS)"
  cat "$BODY_FILE"
  exit 1
fi
SEND_JOB_ID="$(json_parse jobId "$BODY_FILE")"
if [ -z "$SEND_JOB_ID" ]; then
  echo "campaign queue response did not include a job id"
  cat "$BODY_FILE"
  exit 1
fi

FINAL_CAMPAIGN_STATUS=""
for _ in $(seq 1 25); do
  sleep 1
  CAMPAIGN_REFRESH_STATUS="$(request_json GET "/api/campaigns/$CAMPAIGN_ID")"
  if [ "$CAMPAIGN_REFRESH_STATUS" != "200" ]; then
    continue
  fi

  FINAL_CAMPAIGN_STATUS="$(json_parse campaign.status "$BODY_FILE")"
  if [ "$FINAL_CAMPAIGN_STATUS" = "SENT" ] || [ "$FINAL_CAMPAIGN_STATUS" = "FAILED" ]; then
    break
  fi
done

if [ "$FINAL_CAMPAIGN_STATUS" != "SENT" ]; then
  echo "campaign did not finish successfully"
  cat "$BODY_FILE"
  exit 1
fi

SEND_PROVIDER="$(json_parse campaign.provider "$BODY_FILE")"
SEND_SENT_COUNT="$(json_parse campaign.sentCount "$BODY_FILE")"
if [ "${SEND_SENT_COUNT:-0}" -lt 3 ]; then
  echo "campaign send returned an unexpected recipient count"
  cat "$BODY_FILE"
  exit 1
fi

echo "[9/11] ingest provider webhook events"
WEBHOOK_PAYLOAD=$(cat <<JSON
{"events":[
  {"id":"${TEST_PREFIX}-delivered","event":"delivered","campaign_id":"${CAMPAIGN_ID}","email":"s1@example.com"},
  {"id":"${TEST_PREFIX}-opened","event":"opened","campaign_id":"${CAMPAIGN_ID}","email":"s1@example.com"},
  {"id":"${TEST_PREFIX}-bounced","event":"bounce","campaign_id":"${CAMPAIGN_ID}","email":"s3@example.com"}
]}
JSON
)
WEBHOOK_HEADERS=(-H 'content-type: application/json')
if [ -n "${WEBHOOK_SHARED_SECRET:-}" ]; then
  WEBHOOK_HEADERS+=(-H "x-webhook-secret: ${WEBHOOK_SHARED_SECRET}")
fi
WEBHOOK_STATUS="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' "${WEBHOOK_HEADERS[@]}" -X POST -d "$WEBHOOK_PAYLOAD" "$SMOKE_BASE_URL/api/webhooks/resend")"
if [ "$WEBHOOK_STATUS" != "200" ]; then
  echo "webhook ingest failed ($WEBHOOK_STATUS)"
  cat "$BODY_FILE"
  exit 1
fi

echo "[10/11] analytics summary"
ANALYTICS_STATUS="$(request_json GET "/api/analytics/summary?campaignId=$CAMPAIGN_ID&listId=$LIST_A_ID")"
if [ "$ANALYTICS_STATUS" != "200" ]; then
  echo "analytics summary failed ($ANALYTICS_STATUS)"
  cat "$BODY_FILE"
  exit 1
fi
ANALYTICS_SENT="$(json_parse metrics.sent "$BODY_FILE")"
ANALYTICS_OPENED="$(json_parse metrics.opened "$BODY_FILE")"
if [ "${ANALYTICS_SENT:-0}" -lt 1 ] || [ "${ANALYTICS_OPENED:-0}" -lt 1 ]; then
  echo "analytics summary did not reflect the seeded events"
  cat "$BODY_FILE"
  exit 1
fi

echo "[11/11] resource analytics summary"
RESOURCE_STATUS="$(request_json GET "/api/resource-analytics/summary")"
if [ "$RESOURCE_STATUS" != "200" ]; then
  echo "resource analytics summary failed ($RESOURCE_STATUS)"
  cat "$BODY_FILE"
  exit 1
fi

echo "Smoke test passed"
echo "user=$SMOKE_EMAIL"
echo "listA=$LIST_A_ID"
echo "listB=$LIST_B_ID"
echo "template=$TEMPLATE_ID"
echo "campaign=$CAMPAIGN_ID"
echo "provider=$SEND_PROVIDER"
