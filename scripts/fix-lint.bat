@echo off
echo 🔧 正在修复前端代码格式...

cd web\admin-spa

echo 📝 修复 ESLint 错误...
call npm run lint:fix 2>nul || call npx eslint --fix "src/**/*.{js,vue}" --max-warnings 0

echo 🎨 格式化代码...
call npx prettier --write "src/**/*.{js,vue,css,scss,html,json}"

echo ✅ 代码格式修复完成！

echo 🔍 检查剩余问题...
call npm run lint 2>nul || call npx eslint "src/**/*.{js,vue}" --max-warnings 0

if %errorlevel% equ 0 (
    echo 🎉 所有问题已修复！
) else (
    echo ⚠️ 还有一些问题需要手动处理
)