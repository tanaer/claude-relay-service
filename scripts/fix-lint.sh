#!/bin/bash

echo "🔧 正在修复前端代码格式..."

cd web/admin-spa

# 自动修复 ESLint 错误
echo "📝 修复 ESLint 错误..."
npm run lint:fix 2>/dev/null || npx eslint --fix "src/**/*.{js,vue}" --max-warnings 0

# 格式化代码
echo "🎨 格式化代码..."
npx prettier --write "src/**/*.{js,vue,css,scss,html,json}"

echo "✅ 代码格式修复完成！"

# 检查是否还有错误
echo "🔍 检查剩余问题..."
npm run lint 2>/dev/null || npx eslint "src/**/*.{js,vue}" --max-warnings 0

if [ $? -eq 0 ]; then
    echo "🎉 所有问题已修复！"
else
    echo "⚠️ 还有一些问题需要手动处理"
fi