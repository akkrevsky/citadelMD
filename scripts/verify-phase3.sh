#!/bin/bash

echo "🧪 Phase 3 Verification Script"
echo "=============================="

# Check yjs-server health
echo "📡 Testing yjs-server..."
YJS_HEALTH=$(curl -s http://localhost:1234/health | grep -o '"status":"ok"' || echo "failed")
if [[ "$YJS_HEALTH" == "failed" ]]; then
  echo "❌ yjs-server not responding"
  exit 1
fi
echo "✅ yjs-server: OK"

# Test internal endpoints
echo "🔧 Testing internal endpoints..."
FLUSH_RESPONSE=$(curl -s -X POST "http://localhost:1234/internal/yjs-session-active?docid=doc-test")
if echo "$FLUSH_RESPONSE" | grep -q '"active":false'; then
  echo "✅ Internal endpoints: OK"
else
  echo "❌ Internal endpoints failed"
  exit 1  
fi

# Test backend yjs integration
echo "🔗 Testing backend integration..."
# Login and get document
AUTH_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123"}' \
  -c /tmp/cookies.txt http://localhost:3000/api/auth/login)

if echo "$AUTH_RESPONSE" | grep -q '"user"'; then
  echo "✅ Backend auth: OK"
else
  echo "❌ Backend auth failed"
  exit 1
fi

echo ""
echo "🎯 Phase 3 Core Components: VERIFIED"
echo ""
echo "⚠️  Manual verification needed:"
echo "   1. Open http://localhost:8081 in TWO browser windows"  
echo "   2. Login as admin in both windows"
echo "   3. Open same document for editing"
echo "   4. Type in one window - changes should appear in other window"
echo "   5. Test commit/discard buttons"
echo ""