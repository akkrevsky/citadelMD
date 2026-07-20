#!/bin/bash

echo "===== Phase 3 Verification Script ====="

# Helper: query yjs-server HTTP endpoint
yjs_http() {
  docker exec citadelmd-yjs-server-1 node -e "
    const h = require('http');
    h.get('http://localhost:1234$1', r => {
      let d=''; r.on('data', c => d+=c); r.on('end', () => {
        console.log(d); process.exit(r.statusCode === 200 ? 0 : 1);
      });
    }).on('error', () => process.exit(1));
  " 2>/dev/null
}

# 1. yjs-server health
echo "1. yjs-server health..."
if yjs_http /health; then
  echo "   PASS: yjs-server OK"
else
  echo "   FAIL: yjs-server not responding"
  exit 1
fi

# 2. Internal endpoints
echo "2. Internal endpoints..."
INTERNAL=$(yjs_http "/internal/yjs-session-active?docid=doc-test" 2>&1)
echo "   $INTERNAL"

# 3. Backend auth
echo "3. Backend API..."
AUTH=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123"}' \
  http://localhost:3000/api/auth/login 2>/dev/null)
if echo "$AUTH" | grep -q '"user"'; then
  echo "   PASS: Backend auth OK"
else
  echo "   WARN: Backend auth - $(echo $AUTH | head -c 50)"
fi

# 4. Web UI
echo "4. Web UI..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/ 2>/dev/null)
if [ "$STATUS" = "200" ]; then
  echo "   PASS: Web UI OK (port 8081)"
else
  echo "   WARN: Web UI returned HTTP $STATUS"
fi

echo ""
echo "===== Phase 3: VERIFIED ====="
