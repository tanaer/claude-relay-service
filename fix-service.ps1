$password = "0AFd&9!u@Wv%%n"
$server = "root@101.36.120.191"

# 创建期望的命令
$commands = @'
cd /www/wwwroot/claude-relay-service

echo "=== 1. 停止所有Node进程 ==="
pkill -f node || echo "没有运行的node进程"
sleep 2

echo "=== 2. 清理缓存 ==="
rm -rf node_modules/.cache 2>/dev/null
npm cache clean --force

echo "=== 3. 验证代码已更新 ==="
grep -n "updateApiKeyFromDynamicPolicy" src/services/apiKeyService.js | head -5

echo "=== 4. 重新安装依赖 ==="
npm install

echo "=== 5. 启动服务 ==="
npm run service:start:daemon

echo "=== 6. 等待服务启动 ==="
sleep 5

echo "=== 7. 验证方法存在 ==="
node -e "const s = require('./src/services/apiKeyService'); console.log('Method exists:', typeof s.updateApiKeyFromDynamicPolicy);"

echo "=== 8. 检查服务状态 ==="
npm run service:status

echo "=== 9. 健康检查 ==="
curl -s http://localhost:3000/health
'@

# 使用 plink 或 sshpass 执行命令
Write-Host "正在连接到服务器并执行修复..."
echo $password | ssh -o StrictHostKeyChecking=no $server $commands
