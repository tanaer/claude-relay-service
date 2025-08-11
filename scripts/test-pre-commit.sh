#!/bin/bash

echo "🧪 Testing pre-commit hook..."

# 创建一个临时文件来测试
TEST_FILE="test-pre-commit.js"

cat > $TEST_FILE << 'EOF'
// 故意写一些格式不规范的代码来测试
const   test=   {
  name:'test',
  value   :   123
}

console.log( "Hello World"  )
EOF

echo "📝 Created test file with formatting issues:"
cat $TEST_FILE

echo -e "\n🔧 Running pre-commit checks..."

# 运行 pre-commit 脚本
if bash .husky/pre-commit; then
    echo -e "\n✅ Pre-commit hook executed successfully!"
    
    echo -e "\n📄 File after formatting:"
    cat $TEST_FILE
else
    echo -e "\n❌ Pre-commit hook failed!"
fi

# 清理测试文件
rm -f $TEST_FILE

echo -e "\n🎉 Test completed!"