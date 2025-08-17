#!/bin/bash
ssh root@101.36.120.191 << 'EOF'
cd /www/wwwroot/claude-relay-service

echo "=== 检查服务状态 ==="
npm run service:status

echo ""
echo "=== 检查方法是否存在 ==="
node -e "const apiKeyService = require('./src/services/apiKeyService'); console.log('updateApiKeyFromDynamicPolicy exists:', typeof apiKeyService.updateApiKeyFromDynamicPolicy === 'function');"

echo ""
echo "=== 检查最近的错误 (最近5分钟) ==="
find logs -name "*.log" -mmin -5 -exec tail -n 5 {} \; | grep ERROR || echo "没有最近的错误"

echo ""
echo "=== 健康检查 ==="
curl -s http://localhost:3000/health | jq . || echo "健康检查失败"
EOF
