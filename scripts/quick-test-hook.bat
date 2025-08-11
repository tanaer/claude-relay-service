@echo off
REM 快速测试脚本 - 创建格式有问题的代码并测试修复
echo 🧪 Testing pre-commit hook with intentionally bad code...

REM 创建测试文件
echo const test={name:'test',value:123} > test-format.js
echo console.log("Hello World"  ^) >> test-format.js
echo function   badFormat(   ^){ >> test-format.js
echo return    "badly formatted" >> test-format.js
echo } >> test-format.js

echo 📝 Created test file with bad formatting:
type test-format.js

echo.
echo 🔧 Running fix command...
npm run fix:all

echo.
echo 📄 File after formatting:
type test-format.js

REM 清理
del test-format.js

echo.
echo ✅ Test completed!