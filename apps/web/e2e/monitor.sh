#!/bin/bash

# Continuous monitoring script for citadelMD
# Monitors services and alerts on failures

LOG_FILE="/tmp/citadelmd-monitor.log"
CHECK_INTERVAL=30  # seconds

echo "🔄 Starting citadelMD Continuous Monitor"
echo "======================================="
echo "Log file: $LOG_FILE"
echo "Check interval: ${CHECK_INTERVAL}s"
echo ""

monitor_service() {
  local service_name="$1"
  local url="$2" 
  local expected="$3"
  
  response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  
  if [[ "$response" == "$expected" ]]; then
    echo "[$timestamp] ✅ $service_name: OK ($response)" | tee -a "$LOG_FILE"
    return 0
  else
    echo "[$timestamp] ❌ $service_name: FAILED ($response)" | tee -a "$LOG_FILE"
    return 1
  fi
}

monitor_api() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local auth_response=$(curl -s -X POST -H "Content-Type: application/json" \
    -d '{"login":"admin","password":"admin123"}' \
    http://localhost:3000/api/auth/login 2>/dev/null)
    
  if echo "$auth_response" | grep -q '"user"' 2>/dev/null; then
    echo "[$timestamp] ✅ API Auth: OK" | tee -a "$LOG_FILE"
    return 0
  else
    echo "[$timestamp] ❌ API Auth: FAILED" | tee -a "$LOG_FILE"
    return 1
  fi
}

# Initial status check
echo "📋 Initial Status Check:"
monitor_service "Backend" "http://localhost:3000/api/health" "200"
monitor_service "Frontend" "http://localhost:8081" "200" 
monitor_api
echo ""

# Main monitoring loop
while true; do
  failures=0
  
  monitor_service "Backend" "http://localhost:3000/api/health" "200" || ((failures++))
  monitor_service "Frontend" "http://localhost:8081" "200" || ((failures++))
  monitor_api || ((failures++))
  
  if [[ $failures -gt 0 ]]; then
    echo "⚠️  $failures service(s) failing! Check $LOG_FILE for details"
  fi
  
  sleep "$CHECK_INTERVAL"
done