@echo off
echo 🧪 Testing pre-commit hook...

REM 创建一个临时文件来测试
set TEST_FILE=test-pre-commit.js

echo // 故意写一些格式不规范的代码来测试 > %TEST_FILE%
echo const   test=   { >> %TEST_FILE%
echo   name:'test', >> %TEST_FILE%
echo   value   :   123 >> %TEST_FILE%
echo } >> %TEST_FILE%
echo. >> %TEST_FILE%
echo console.log( "Hello World"  ^) >> %TEST_FILE%

echo 📝 Created test file with formatting issues:
type %TEST_FILE%

echo.
echo 🔧 Running pre-commit checks...

REM 运行 pre-commit 脚本
call .husky\pre-commit.bat
if %errorlevel% equ 0 (
    echo.
    echo ✅ Pre-commit hook executed successfully!
    
    echo.
    echo 📄 File after formatting:
    type %TEST_FILE%
) else (
    echo.
    echo ❌ Pre-commit hook failed!
)

REM 清理测试文件
del %TEST_FILE%

echo.
echo 🎉 Test completed!