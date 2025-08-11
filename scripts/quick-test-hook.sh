#!/bin/bash

# 快速测试脚本 - 创建格式有问题的代码并测试修复
echo "🧪 Testing pre-commit hook with intentionally bad code..."

# 创建测试文件
cat > test-format.js << 'EOF'
const test={name:'test',value:123}
console.log("Hello World"  )
function   badFormat(   ){
return    "badly formatted"
}
EOF

echo "📝 Created test file with bad formatting:"
cat test-format.js

echo -e "\n🔧 Running pre-commit hook..."
.husky/pre-commit

echo -e "\n📄 File after hook execution:"
cat test-format.js

# 清理
rm -f test-format.js

echo -e "\n✅ Test completed!"