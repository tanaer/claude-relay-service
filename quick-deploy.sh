#!/bin/bash

# 快速部署脚本 - 简化版本
# 用法: ./quick-deploy.sh

set -e

echo "🚀 Claude Relay Service - 快速部署"
echo "=================================="

# 拉取代码
echo "📥 拉取最新代码..."
git pull

# 构建前端
echo "🔨 构建前端..."
npm run build:web

# 重启服务
echo "🔄 重启服务..."
npm run service:stop || true
sleep 2
npm run service:start:daemon

# 检查状态
echo "✅ 检查服务状态..."
sleep 3
npm run service:status

echo "🎉 部署完成！"