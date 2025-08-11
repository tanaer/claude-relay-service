@echo off
echo 🔍 Running pre-commit checks...

REM 格式化和修复后端代码
echo 📝 Formatting backend code...
call npm run format
call npm run lint

REM 格式化和修复前端代码
echo 🎨 Formatting frontend code...
cd web\admin-spa
call npm run format
call npm run lint:fix

REM 最终检查
echo ✅ Final checks...
cd ..\..\
call npm run lint:check
if %errorlevel% neq 0 (
    echo ❌ Backend lint check failed!
    exit /b 1
)

cd web\admin-spa
call npm run lint:check
if %errorlevel% neq 0 (
    echo ❌ Frontend lint check failed!
    exit /b 1
)

echo 🎉 All checks passed! Committing...
exit /b 0