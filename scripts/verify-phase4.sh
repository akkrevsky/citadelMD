#!/bin/bash
set -euo pipefail

echo "=== Phase 4 Verification ==="

# 1. Health check
echo "--- Health check ---"
curl -sf http://localhost:3000/api/health > /dev/null && echo "PASS" || { echo "FAIL"; exit 1; }

# 2. Login
echo "--- Login ---"
TOKEN=$(curl -sf -c - -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123"}' | grep token | awk '{print $NF}')
[ -n "$TOKEN" ] && echo "PASS" || { echo "FAIL"; exit 1; }

# 3. Quota endpoint
echo "--- User quota ---"
curl -sf -b "token=$TOKEN" http://localhost:3000/api/users/me/quota | grep -q "maxBytes" && echo "PASS" || { echo "FAIL"; exit 1; }

# 4. Share API
echo "--- Share API ---"
DOC_ID=$(curl -sf http://localhost:3000/api/tree -b "token=$TOKEN" | python3 -c 'import sys,json; print(json.load(sys.stdin)["tree"][0]["documents"][0]["id"])' 2>/dev/null || echo "")
if [ -n "$DOC_ID" ]; then
  SHARE_RES=$(curl -sf -b "token=$TOKEN" -X POST "http://localhost:3000/api/documents/$DOC_ID/shares" \
    -H "Content-Type: application/json" -d '{"permission":"READ","ttlHours":24}')
  SHARE_TOKEN=$(echo "$SHARE_RES" | python3 -c 'import sys,json; print(json.load(sys.stdin)["share"]["token"])')
  [ -n "$SHARE_TOKEN" ] && echo "PASS (token: $SHARE_TOKEN)" || { echo "FAIL"; exit 1; }

  # Resolve share
  curl -sf "http://localhost:3000/api/shares/$SHARE_TOKEN" | grep -q "READ" && echo "PASS: share resolve" || { echo "FAIL"; exit 1; }
else
  echo "SKIP (no documents)"
fi

# 5. Web UI
echo "--- Web UI ---"
curl -sf http://localhost:8081/ | grep -q "citadelMD" && echo "PASS" || { echo "FAIL (web UI not accessible)"; exit 1; }

echo ""
echo "=== Phase 4 Verification Complete ==="
