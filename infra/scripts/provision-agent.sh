#!/usr/bin/env bash
# Provision the AI-agent service user (`harness`, ADMIN) and store its apiKey
# as DSH_MCP_TOKEN in infra/.env (gitignored). Idempotent: on every run the
# user is created if missing and its apiKey is rotated; the running dsh
# container must be recreated afterwards to pick up the new key.
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a

: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is not set in infra/.env}"
BASE="${PUBLIC_BASE_URL:-http://localhost:8081}"
LOGIN="${DSH_ADMIN_LOGIN:-admin}"

JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

echo "==> Logging in as $LOGIN"
code="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"$LOGIN\",\"password\":\"$ADMIN_PASSWORD\"}")"
[ "$code" = "200" ] || { echo "login failed (HTTP $code)" >&2; exit 1; }

echo "==> Looking up user harness"
USERS="$(curl -sf -b "$JAR" "$BASE/api/users")"
USER_ID="$(printf '%s' "$USERS" | python3 -c '
import json, sys
data = json.load(sys.stdin)
rows = data["data"] if isinstance(data, dict) and "data" in data else data
for u in rows:
    if u.get("login") == "harness":
        print(u["id"])
        break
')"

if [ -z "$USER_ID" ]; then
  echo "==> Creating user harness (ADMIN)"
  # Base64 alphabet has no digits guaranteed — prefix keeps the password valid
  # (>=10 chars, at least one digit, not equal to login).
  PW="A9$(openssl rand -base64 18 | tr -d '=/+' | head -c 14)"
  code="$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/users" \
    -H 'Content-Type: application/json' \
    -d "{\"login\":\"harness\",\"password\":\"$PW\",\"role\":\"ADMIN\",\"displayName\":\"Agent Harness\"}")"
  [ "$code" = "201" ] || { echo "user create failed (HTTP $code)" >&2; exit 1; }
  USERS="$(curl -sf -b "$JAR" "$BASE/api/users")"
  USER_ID="$(printf '%s' "$USERS" | python3 -c '
import json, sys
data = json.load(sys.stdin)
rows = data["data"] if isinstance(data, dict) and "data" in data else data
for u in rows:
    if u.get("login") == "harness":
        print(u["id"])
        break
')"
  [ -n "$USER_ID" ] || { echo "created user not found in list" >&2; exit 1; }
fi

echo "==> Rotating apiKey for harness"
BODY="$(curl -sf -b "$JAR" -X PATCH "$BASE/api/users/$USER_ID" \
  -H 'Content-Type: application/json' \
  -d '{"regenerateApiKey":true}')"
KEY="$(printf '%s' "$BODY" | python3 -c '
import json, sys
u = json.load(sys.stdin)
k = u.get("apiKey")
if not k:
    sys.exit("PATCH response contains no apiKey")
print(k)
')"

echo "==> Verifying the key (ApiKey auth on /api/auth/me)"
code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/auth/me" -H "Authorization: ApiKey $KEY")"
[ "$code" = "200" ] || { echo "key verification failed (HTTP $code)" >&2; exit 1; }

if grep -q '^DSH_MCP_TOKEN=' .env; then
  sed -i "s|^DSH_MCP_TOKEN=.*|DSH_MCP_TOKEN=$KEY|" .env
else
  printf '\n# AI agent (dsh) MCP token: apiKey of the harness service user\nDSH_MCP_TOKEN=%s\n' "$KEY" >> .env
fi

echo "==> Done: user harness (ADMIN), DSH_MCP_TOKEN written to infra/.env"
echo "    Restart dsh to apply the rotated key: make -C infra redeploy"
