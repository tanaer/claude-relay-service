#!/bin/bash

# Claude Relay Service 自动部署脚本
# 作用：拉取最新代码、构建前端、重启服务

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否在项目根目录
check_directory() {
    if [ ! -f "package.json" ]; then
        log_error "请在项目根目录运行此脚本"
        exit 1
    fi
    
    if [ ! -f "src/app.js" ]; then
        log_error "未找到 src/app.js，请确认在正确的项目目录"
        exit 1
    fi
}

# 显示当前状态
show_status() {
    log_info "=== Claude Relay Service 部署脚本 ==="
    log_info "当前目录: $(pwd)"
    log_info "当前分支: $(git branch --show-current 2>/dev/null || echo '未知')"
    log_info "当前时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo
}

# Git 拉取最新代码
git_pull() {
    log_info "正在拉取最新代码..."
    
    # 检查是否有未提交的更改
    if ! git diff --quiet || ! git diff --cached --quiet; then
        log_warning "检测到未提交的更改："
        git status --porcelain
        echo
        read -p "是否要继续？这可能会导致合并冲突 (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "部署已取消"
            exit 0
        fi
    fi
    
    # 拉取代码
    if git pull origin $(git branch --show-current); then
        log_success "代码拉取成功"
    else
        log_error "代码拉取失败"
        exit 1
    fi
}

# 构建前端
build_web() {
    log_info "正在构建前端..."
    
    if npm run build:web; then
        log_success "前端构建成功"
    else
        log_error "前端构建失败"
        exit 1
    fi
}

# 停止服务
stop_service() {
    log_info "正在停止服务..."
    
    # 先检查服务是否在运行
    if npm run service:status > /dev/null 2>&1; then
        if npm run service:stop; then
            log_success "服务停止成功"
        else
            log_warning "服务停止可能有问题，继续执行..."
        fi
    else
        log_info "服务当前未运行"
    fi
    
    # 等待服务完全停止
    sleep 2
}

# 启动服务
start_service() {
    log_info "正在启动服务..."
    
    if npm run service:start:daemon; then
        log_success "服务启动成功"
        
        # 等待服务启动
        log_info "等待服务启动..."
        sleep 3
        
        # 检查服务状态
        if npm run service:status; then
            log_success "服务运行正常"
        else
            log_warning "服务状态检查失败，请手动检查"
        fi
    else
        log_error "服务启动失败"
        exit 1
    fi
}

# 显示服务信息
show_service_info() {
    echo
    log_info "=== 部署完成 ==="
    log_info "服务状态："
    npm run service:status || true
    
    echo
    log_info "可用的管理命令："
    log_info "  查看状态: npm run service:status"
    log_info "  查看日志: npm run service:logs"
    log_info "  停止服务: npm run service:stop"
    log_info "  重启服务: npm run service:restart"
    
    echo
    log_success "部署完成！"
}

# 主函数
main() {
    show_status
    check_directory
    
    git_pull
    build_web
    stop_service
    start_service
    show_service_info
}

# 捕获 Ctrl+C
trap 'echo; log_warning "部署被中断"; exit 1' INT

# 运行主函数
main "$@"