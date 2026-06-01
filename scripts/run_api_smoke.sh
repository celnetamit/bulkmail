#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
COOKIE_FILE="/tmp/mailflow-smoke.cookies"
rm -f "$COOKIE_FILE"

EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="password123"

echo "[1/8] register"
curl -s -c "$COOKIE_FILE" -H 'content-type: application/json' \
  -d "{\"name\":\"Smoke User\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  "$BASE_URL/api/auth/register" >/dev/null

echo "[2/8] create list"
LIST_JSON=$(curl -s -b "$COOKIE_FILE" -H 'content-type: application/json' -d '{"name":"Smoke List"}' "$BASE_URL/api/lists")
LIST_ID=$(echo "$LIST_JSON" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

echo "[3/8] add contacts"
curl -s -b "$COOKIE_FILE" -H 'content-type: application/json' -d "{\"listId\":\"$LIST_ID\",\"email\":\"s1@example.com\"}" "$BASE_URL/api/contacts" >/dev/null
curl -s -b "$COOKIE_FILE" -H 'content-type: application/json' -d "{\"listId\":\"$LIST_ID\",\"email\":\"s2@example.com\"}" "$BASE_URL/api/contacts" >/dev/null

echo "[4/8] create campaign"
CAMPAIGN_JSON=$(curl -s -b "$COOKIE_FILE" -H 'content-type: application/json' -d "{\"name\":\"Smoke Campaign\",\"listId\":\"$LIST_ID\",\"subject\":\"Smoke\",\"bodyHtml\":\"<p>Hi</p>\"}" "$BASE_URL/api/campaigns")
CAMPAIGN_ID=$(echo "$CAMPAIGN_JSON" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

echo "[5/8] send campaign"
curl -s -b "$COOKIE_FILE" -X POST "$BASE_URL/api/campaigns/$CAMPAIGN_ID/send" >/dev/null

echo "[6/8] webhook ingest"
curl -s -H 'content-type: application/json' -d "{\"events\":[{\"id\":\"smk-1\",\"event\":\"delivered\",\"campaign_id\":\"$CAMPAIGN_ID\",\"email\":\"s1@example.com\"},{\"id\":\"smk-2\",\"event\":\"opened\",\"campaign_id\":\"$CAMPAIGN_ID\",\"email\":\"s1@example.com\"}]}" "$BASE_URL/api/webhooks/resend" >/dev/null

echo "[7/8] analytics summary"
ANALYTICS=$(curl -s -b "$COOKIE_FILE" "$BASE_URL/api/analytics/summary?campaignId=$CAMPAIGN_ID&listId=$LIST_ID")

echo "[8/8] assert basic metrics"
echo "$ANALYTICS" | rg '"sent":|"delivered":|"opened":' >/dev/null

echo "Smoke test passed"
