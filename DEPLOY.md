# 自动部署脚本

为 Claude Relay Service 项目创建了三个自动部署脚本，可以一键完成代码更新和服务重启。

## 脚本文件

### 1. `deploy.sh` (Linux/macOS 完整版)
功能完整的部署脚本，包含：
- 彩色日志输出
- 错误处理和回滚
- 未提交更改检测
- 服务状态验证
- 详细的执行反馈

```bash
chmod +x deploy.sh
./deploy.sh
```

### 2. `deploy.bat` (Windows 版本)
Windows 批处理脚本，功能与 Linux 版本相同：
- UTF-8 编码支持
- 错误检测和处理
- 详细的执行步骤显示
- 服务状态检查

```cmd
deploy.bat
```

### 3. `quick-deploy.sh` (快速版本)
简化的部署脚本，适合频繁部署：
- 最少的交互
- 快速执行
- 基本的错误处理

```bash
chmod +x quick-deploy.sh
./quick-deploy.sh
```

## 执行步骤

所有脚本都会按以下顺序执行：

1. **Git Pull** - 拉取最新代码
2. **Build Web** - 构建前端资源 (`npm run build:web`)
3. **Stop Service** - 停止当前服务 (`npm run service:stop`)
4. **Start Service** - 启动服务 (`npm run service:start:daemon`)
5. **Status Check** - 验证服务状态 (`npm run service:status`)

## 使用建议

- **生产环境**: 使用 `deploy.sh` 或 `deploy.bat`，有完整的错误处理
- **开发环境**: 使用 `quick-deploy.sh`，快速迭代
- **首次使用**: 建议先在测试环境验证脚本功能

## 注意事项

- 脚本会检查是否在项目根目录运行
- 如有未提交的更改，完整版脚本会提示确认
- 服务重启时会有 2-3 秒的等待时间确保完全停止
- 如果构建失败，脚本会立即退出，不会重启服务