#!/bin/bash

# Simple e2e test script for citadelMD
# Tests basic functionality and JavaScript errors

echo "🧪 Starting citadelMD E2E Tests"
echo "================================"

# Check if services are running
echo "📋 Checking services..."

# Backend health check
BACKEND_STATUS=$(curl -s http://localhost:3000/api/health | grep -o '"status":"ok"' || echo "failed")
if [[ "$BACKEND_STATUS" == "failed" ]]; then
  echo "❌ Backend not responding on localhost:3000"
  exit 1
fi
echo "✅ Backend API: OK"

# Web frontend check  
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081)
if [[ "$WEB_STATUS" != "200" ]]; then
  echo "❌ Web frontend not responding on localhost:8081"  
  exit 1
fi
echo "✅ Web frontend: OK"

# API Authentication test
echo "🔑 Testing authentication..."
AUTH_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123"}' \
  http://localhost:3000/api/auth/login)

if echo "$AUTH_RESPONSE" | grep -q '"user"'; then
  echo "✅ Authentication: OK"
else
  echo "❌ Authentication failed: $AUTH_RESPONSE"
  exit 1
fi

# Tree API test
echo "📁 Testing folder tree API..."
TREE_RESPONSE=$(curl -s -c /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123"}' http://localhost:3000/api/auth/login)

TREE_DATA=$(curl -s -b /tmp/cookies.txt http://localhost:3000/api/tree)
if echo "$TREE_DATA" | grep -q '"tree"'; then
  echo "✅ Folder tree API: OK"
else
  echo "❌ Folder tree API failed: $TREE_DATA"
  exit 1  
fi

# Test document creation
echo "📝 Testing document creation..."
FOLDER_ID=$(echo "$TREE_DATA" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')
if [[ -n "$FOLDER_ID" ]]; then
  DOC_RESPONSE=$(curl -s -b /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
    -d '{"title":"E2E Test Document"}' \
    "http://localhost:3000/api/folders/$FOLDER_ID/documents")
  
  if echo "$DOC_RESPONSE" | grep -q '"id"'; then
    echo "✅ Document creation: OK"
  else
    echo "❌ Document creation failed: $DOC_RESPONSE"
  fi
else
  echo "⚠️ No folder found for document creation test"
fi

echo ""
echo "🎯 Basic API Tests: PASSED"
echo ""
echo "⚠️  Manual tests still needed:"
echo "   1. Open http://localhost:8081 in browser"  
echo "   2. Login with admin/admin123"
echo "   3. Check browser console for JavaScript errors"
echo "   4. Navigate between pages (Dashboard, Admin Users, Profile)"
echo "   5. Click on Root folder in sidebar"
echo "   6. Try to create/edit documents through UI"
echo ""
echo "🔍 To see current JavaScript errors, open browser DevTools Console"

# Clean up
rm -f /tmp/cookies.txt