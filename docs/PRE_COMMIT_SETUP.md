# 🚀 全自动 Pre-commit Hook 配置完成！

## ✅ 已配置功能

### 🔧 自动修复
每次 `git commit` 前会自动执行：
1. **后端代码格式化** - Prettier 格式化 JS 文件
2. **前端代码格式化** - Prettier 格式化 Vue/JS/CSS 文件
3. **ESLint 自动修复** - 自动修复可修复的 ESLint 错误
4. **最终检查** - 确保没有遗留的格式或语法问题

### 🎯 触发时机
- **Pre-commit**: 每次 `git commit` 时自动执行
- **Pre-push**: 每次 `git push` 时运行测试
- **手动执行**: 可以随时手动运行

## 🛠️ 使用方法

### 日常提交（全自动）
```bash
# 正常提交，会自动格式化和检查
git add .
git commit -m "your message"

# 如果有格式问题，会自动修复并继续提交
# 如果有无法自动修复的错误，会阻止提交并显示错误信息
```

### 手动执行检查和修复
```bash
# 修复所有格式问题（推荐）
npm run fix:all

# 只格式化代码
npm run format:all  

# 只修复 ESLint 问题
npm run lint:all

# 检查但不修复
npm run lint:check
cd web/admin-spa && npm run lint:check
```

### 跳过检查（紧急情况）
```bash
# 跳过 pre-commit 检查
git commit --no-verify -m "urgent fix"

# 跳过 pre-push 检查  
git push --no-verify
```

## 🧪 测试 Hook

### Windows
```bash
scripts\test-pre-commit.bat
```

### Linux/Mac
```bash
chmod +x scripts/test-pre-commit.sh
./scripts/test-pre-commit.sh
```

## 📋 支持的文件类型

### 后端 (自动格式化 + ESLint)
- `src/**/*.js`
- `cli/**/*.js` 
- `scripts/**/*.js`

### 前端 (自动格式化 + ESLint + Vue规则)
- `web/admin-spa/src/**/*.vue`
- `web/admin-spa/src/**/*.js`
- `web/admin-spa/src/**/*.ts`
- `web/admin-spa/src/**/*.css`
- `web/admin-spa/src/**/*.scss`
- `web/admin-spa/src/**/*.json`

## 🔧 配置文件位置

- **Husky 配置**: `.husky/pre-commit`
- **Lint-staged 配置**: `package.json` 中的 `lint-staged` 字段
- **ESLint 配置**: `.eslintrc.js` 
- **Prettier 配置**: `.prettierrc`

## 🚨 常见问题

### Q: Hook 不执行？
```bash
# 重新设置 git hooks 路径
git config core.hooksPath .husky

# 确保文件有执行权限
chmod +x .husky/pre-commit
```

### Q: 想临时禁用 Hook？
```bash
# 方法1: 跳过单次检查
git commit --no-verify -m "message"

# 方法2: 临时禁用（不推荐）
mv .husky/pre-commit .husky/pre-commit.backup
# 恢复: mv .husky/pre-commit.backup .husky/pre-commit
```

### Q: Hook 执行太慢？
可以修改 `.husky/pre-commit` 文件，只检查暂存的文件：
```bash
# 使用 lint-staged 只处理暂存的文件
npx lint-staged
```

## 🎉 收益

1. **零手动干预** - 提交时自动修复格式问题
2. **团队代码一致性** - 统一的代码风格
3. **减少 Code Review 时间** - 格式问题被自动解决
4. **避免 CI 失败** - 提交前就发现和解决问题
5. **提高开发效率** - 不用手动运行格式化命令

现在你可以安心开发，格式问题会自动处理！ 🚀