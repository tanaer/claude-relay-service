#!/bin/bash

# 服务器端 naive-ui 引用清理和构建修复脚本
# 用于解决构建错误: "Rollup failed to resolve import "naive-ui""

echo "🔧 开始修复服务器端 naive-ui 构建错误..."

# 设置项目路径
PROJECT_ROOT="/www/wwwroot/claude-relay-service"
WEB_APP_PATH="$PROJECT_ROOT/web/admin-spa"

# 检查项目目录是否存在
if [ ! -d "$PROJECT_ROOT" ]; then
    echo "❌ 项目目录不存在: $PROJECT_ROOT"
    exit 1
fi

cd "$PROJECT_ROOT"

echo "📍 当前路径: $(pwd)"

# 1. 检查 naive-ui 引用
echo -e "\n🔍 步骤 1: 检查 naive-ui 引用..."
if [ -f "scripts/check-naive-ui-refs.js" ]; then
    node scripts/check-naive-ui-refs.js
else
    echo "⚠️  检查脚本不存在，跳过检查步骤"
fi

# 2. 清理构建缓存
echo -e "\n🧹 步骤 2: 清理构建缓存..."
cd "$WEB_APP_PATH"

if [ -d "node_modules" ]; then
    echo "删除 node_modules..."
    rm -rf node_modules
fi

if [ -d "dist" ]; then
    echo "删除 dist..."
    rm -rf dist
fi

if [ -d ".vite" ]; then
    echo "删除 .vite 缓存..."
    rm -rf .vite
fi

# 3. 重新安装依赖
echo -e "\n📦 步骤 3: 重新安装依赖..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ npm install 失败"
    exit 1
fi

# 4. 检查 package.json 是否有 naive-ui 依赖
echo -e "\n🔍 步骤 4: 检查 package.json 依赖..."
if grep -q "naive" package.json; then
    echo "⚠️  警告: package.json 中仍有 naive 相关依赖"
    grep "naive" package.json
    echo "请手动移除这些依赖"
else
    echo "✅ package.json 中无 naive 相关依赖"
fi

# 5. 尝试构建
echo -e "\n🏗️  步骤 5: 尝试构建..."
npm run build
BUILD_STATUS=$?

if [ $BUILD_STATUS -eq 0 ]; then
    echo -e "\n🎉 构建成功！naive-ui 错误已修复"
    
    # 检查构建输出
    if [ -d "dist" ]; then
        echo "✅ dist 目录已生成"
        echo "📊 构建产物大小:"
        du -sh dist/*
    fi
else
    echo -e "\n❌ 构建仍然失败"
    echo "请检查构建日志中的错误信息"
    
    echo -e "\n🔍 建议检查:"
    echo "1. 是否还有其他文件引用了 naive-ui"
    echo "2. 是否有其他依赖问题"
    echo "3. 查看具体的构建错误信息"
fi

echo -e "\n📝 修复完成报告:"
echo "- 清理了 node_modules, dist, .vite 目录"
echo "- 重新安装了依赖"
echo "- 构建状态: $([ $BUILD_STATUS -eq 0 ] && echo '成功' || echo '失败')"

exit $BUILD_STATUS