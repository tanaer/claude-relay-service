# 开发指南

## 代码质量工具

### 本地开发

#### ESLint
```bash
# 检查代码质量问题
npm run lint:check

# 自动修复可修复的问题
npm run lint
```

#### Prettier
```bash
# 格式化后端代码
npm run format

# 格式化前端代码
npm run format:web

# 格式化所有代码
npm run format:all

# 检查格式化状态（不修改文件）
npm run format:check
```

### GitHub Actions 自动化

我们设置了三个GitHub Actions工作流：

#### 1. Lint and Format (`lint-and-format.yml`)
- **触发条件**: Push到main/devlocal分支，或PR到main分支
- **功能**:
  - 运行ESLint检查和自动修复
  - 运行Prettier格式化
  - 如果是push事件，自动提交格式化的代码
  - 如果是PR事件，添加评论提醒代码已格式化

#### 2. Code Quality (`code-quality.yml`)
- **触发条件**: Push到main/devlocal分支，或PR到main分支
- **功能**:
  - ESLint质量检查（前端和后端）
  - Prettier格式检查
  - 运行测试（如果存在）
  - 安全审计
  - 检查TODO/FIXME注释

#### 3. Auto Fix (`auto-fix.yml`)
- **触发条件**: 手动触发或每周日凌晨2点
- **功能**:
  - 自动修复ESLint问题
  - Prettier格式化
  - 移除末尾空白字符
  - 统一换行符为LF
  - 创建PR包含所有修复

### 配置文件

#### Prettier 配置
- **根目录**: `.prettierrc.js` - 通用配置
- **前端**: `web/admin-spa/.prettierrc.js` - 前端特定配置
- **忽略**: `.prettierignore` - 排除文件

#### ESLint 配置
- 使用项目现有的ESLint配置

### 最佳实践

#### 开发工作流
1. **编码前**: 确保代码符合现有风格
2. **编码中**: 使用IDE插件实时检查
3. **提交前**: 运行 `npm run format:all && npm run lint`
4. **推送后**: GitHub Actions自动处理格式化

#### 代码风格
- **缩进**: 2个空格
- **引号**: 单引号
- **分号**: 不使用分号
- **换行**: LF换行符
- **行宽**: 100字符

#### Vue特定
- 每行一个属性（长属性）
- script和style标签内容缩进
- 使用Tailwind CSS插件排序

### 故障排除

#### 常见问题
1. **Prettier插件缺失**: `cd web/admin-spa && npm install prettier-plugin-tailwindcss`
2. **权限问题**: 确保GitHub Actions有写权限
3. **格式冲突**: 先运行Prettier再运行ESLint

#### 调试命令
```bash
# 检查Prettier配置
npx prettier --find-config-path src/app.js

# 检查ESLint配置
npx eslint --print-config src/app.js

# 手动运行单个文件
npx prettier --write src/services/redemptionCodeService.js
npx eslint --fix src/services/redemptionCodeService.js
```

## 兑换码系统

### 开发完成
✅ 后端服务和数据模型
✅ API路由和端点
✅ 管理后台界面
✅ 用户兑换界面
✅ 导航菜单集成
✅ 代码格式化和质量检查

### 测试
系统已完成基础测试，可以启动服务进行完整功能测试。