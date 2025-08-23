Param(
    [string]$ApiKey = "__API_TOKEN__",
    [string]$BaseUrl = "__BASE_URL__"
)
# =============================================
# 检查并安装 Node.js 22+
# =============================================
function Install-NodeV22 {
    try {
        $node = Get-Command node -ErrorAction SilentlyContinue
        if ($null -ne $node) {
            $ver = (node -v) -replace '^v', ''
            $major = [int]($ver.Split('.')[0])
            if ($major -ge 22) {
                Write-Success "已安装 Node.js v$ver (>=22)"
                return
            }
            else {
                Write-Warn "检测到 Node.js v$ver，低于 v22，将尝试升级"
            }
        }
        else {
            Write-Info "未检测到 Node.js，将尝试安装 v22"
        }

        # 优先尝试 winget（Windows 环境）
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($null -ne $winget) {
            try {
                winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements | Out-Null
            }
            catch {}
        }

        # 如果 winget 不可用或失败，尝试官网 MSI（x64）
        $nodeOk = $false
        try {
            $ver2 = (node -v) -replace '^v', ''
            $major2 = [int]($ver2.Split('.')[0])
            if ($major2 -ge 22) { $nodeOk = $true }
        }
        catch {}

        if (-not $nodeOk) {
            try {
                # 使用 jsDelivr 镜像加速 Node.js 下载（国内更快）
                $msiUrl = 'https://npmmirror.com/mirrors/node/v22.18.0/node-v22.18.0-x64.msi'
                $msiPath = Join-Path $env:TEMP 'node-v22-x64.msi'
                Write-Info "下载 Node.js v22 安装包..."
                Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
                Write-Info "静默安装 Node.js..."
                Start-Process msiexec.exe -ArgumentList '/i', $msiPath, '/quiet', '/norestart' -Wait
            }
            catch {
                Write-Warn "自动安装 Node.js 失败：$($_.Exception.Message)"
            }
        }

        try {
            $ver3 = (node -v) -replace '^v', ''
            $major3 = [int]($ver3.Split('.')[0])
            if ($major3 -ge 22) {
                Write-Success "Node.js v$ver3 安装就绪"
            }
            else {
                Write-Warn "Node.js 版本仍低于 22，请手动安装最新 LTS (v22+) 后重试"
            }
        }
        catch {
            Write-Warn "未能检测到 Node.js，请手动安装 v22+ 后重试"
        }
    }
    catch {
        Write-Warn "Install-NodeV22 出错：$($_.Exception.Message)"
    }
}
 
# =============================================
# MuskAPI / Claude Code 环境初始化脚本（PowerShell）
# 支持在线执行：iwr/irm URL | iex
# 后端会按需注入占位符：__API_TOKEN__ / __BASE_URL__
# =============================================

$ErrorActionPreference = 'Stop'

# 颜色输出函数
function Write-Info($msg) { Write-Host "[信息] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[成功] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[警告] $msg" -ForegroundColor Yellow }
function Write-ErrorMsg($msg) { Write-Host "[错误] $msg" -ForegroundColor Red }

# 解析 API Key（优先使用占位符注入的参数，其次环境变量）
if ($ApiKey -eq "__API_TOKEN__" -or [string]::IsNullOrWhiteSpace($ApiKey)) {
    if ($env:API_KEY) { $ApiKey = $env:API_KEY }
    elseif ($env:CLAUDE_API_KEY) { $ApiKey = $env:CLAUDE_API_KEY }
    elseif ($env:ANTHROPIC_AUTH_TOKEN) { $ApiKey = $env:ANTHROPIC_AUTH_TOKEN }
    elseif ($env:ANTHROPIC_API_KEY) { $ApiKey = $env:ANTHROPIC_API_KEY }
}

# 镜像选择：允许用户选择使用国内/国外源
function Resolve-MirrorChoice {
    param([string]$Mirror = "")

    if ([string]::IsNullOrWhiteSpace($Mirror)) {
        $Mirror = $env:INSTALL_MIRROR
    }
    if ([string]::IsNullOrWhiteSpace($Mirror)) {
        $Mirror = $env:CN_MIRROR
    }
    if ([string]::IsNullOrWhiteSpace($Mirror)) {
        $Mirror = $env:USE_CN_MIRROR
    }

    $Mirror = ($Mirror + "").ToLower()
    if ($Mirror -in @('cn', 'china', 'domestic', '1', 'true')) { return 'cn' }
    if ($Mirror -in @('global', 'intl', 'international', '0', 'false')) { return 'global' }

    # 交互选择
    try {
        if ($Host.UI.RawUI.KeyAvailable) {
            $reply = Read-Host "是否使用国内镜像(更快更稳)? [Y/n]"
            if ([string]::IsNullOrWhiteSpace($reply) -or $reply -match '^[Yy]$') { return 'cn' }
            else { return 'global' }
        }
    }
    catch {}
    return 'cn'
}

# 配置 npm registry（根据镜像选择）
function Set-NpmRegistry {
    param([string]$MirrorChoice = "")
    try {
        $npm = Get-Command npm -ErrorAction SilentlyContinue
        if ($null -eq $npm) { return }
        if ($MirrorChoice -eq 'cn') {
            Write-Info "配置 npm registry 到国内源 (npmmirror)"
            npm config set registry https://registry.npmmirror.com --location=global | Out-Null
        }
        else {
            Write-Info "配置 npm registry 到官方源 (npmjs)"
            npm config set registry https://registry.npmjs.org --location=global | Out-Null
        }
    }
    catch {}
}

# 安装 Claude CLI（若未安装）
function Install-ClaudeCLI {
    try {
        $claude = Get-Command claude -ErrorAction SilentlyContinue
        if ($null -ne $claude) {
            Write-Info "检测到 Claude CLI: $($claude.Source)"
            try {
                $ver = (claude --version) 2>$null
                Write-Info "Claude CLI 版本: $ver"
            }
            catch {}
            return
        }

        Write-Info "安装 Claude CLI..."
        npm install -g @anthropic-ai/claude-code | Out-Null
        $claude2 = Get-Command claude -ErrorAction SilentlyContinue
        if ($null -ne $claude2) {
            Write-Success "Claude CLI 安装成功"
        }
        else {
            Write-Warn "Claude CLI 安装失败，请手动执行：npm i -g @anthropic-ai/claude-code"
        }
    }
    catch {
        Write-Warn "安装 Claude CLI 失败：$($_.Exception.Message)"
    }
}

# 让 Node.js v22 永久生效（将 nvm 自动加载/使用的指令写入用户配置）
function Set-NvmDefaultNode {
    try {
        $nvmDir = "$HOME/.nvm"
        $nvmScript = Join-Path $nvmDir 'nvm.sh'
        if (-not (Test-Path $nvmScript)) { return }

        $block = @'
# Claude CLI NVM Node.js v22
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"
nvm alias default 22 >/dev/null 2>&1 || true
nvm use 22 >/dev/null 2>&1 || true
'@

        $rcFiles = @("$HOME/.bashrc", "$HOME/.profile", "$HOME/.zshrc")
        foreach ($rc in $rcFiles) {
            try {
                if (-not (Test-Path $rc)) { New-Item -ItemType File -Path $rc -Force | Out-Null }
                $content = Get-Content -Raw -ErrorAction SilentlyContinue -Path $rc
                if ($content -notmatch 'Claude CLI NVM Node.js v22') {
                    Add-Content -Path $rc -Value $block
                }
            }
            catch {}
        }
    }
    catch {}
}

# 解析 BaseUrl（优先使用占位符注入的参数）
if ($BaseUrl -eq "__BASE_URL__" -or [string]::IsNullOrWhiteSpace($BaseUrl)) {
    if ($env:BASE_URL) { $BaseUrl = $env:BASE_URL }
    elseif ($env:CLAUDE_API_URL) { $BaseUrl = $env:CLAUDE_API_URL }
    elseif ($env:ANTHROPIC_BASE_URL) { $BaseUrl = $env:ANTHROPIC_BASE_URL }
    else { $BaseUrl = "https://ccapi.muskapi.com/api/" }
}

# 交互式输入（仅在没有管道执行且仍为空时）
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    try {
        if ($Host.UI.RawUI.KeyAvailable) {
            $ApiKey = Read-Host "请输入 API Key (cr_ 开头)"
        }
    }
    catch {}
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    Write-Warn "未提供 API Key，将仅安装/校验 Node.js 与 Claude CLI，并配置 BaseUrl。可稍后在 PowerShell 中设置：$env:ANTHROPIC_AUTH_TOKEN"
    $skipApiKey = $true
}
else {
    $skipApiKey = $false
}

Write-Info "即将配置环境变量："
Write-Host "  API_KEY: $($ApiKey.Substring(0, [Math]::Min(10, $ApiKey.Length)))..."
Write-Host "  BASE_URL: $BaseUrl"

try {
    # 选择镜像
    $mirrorChoice = Resolve-MirrorChoice
    if ($mirrorChoice -eq 'cn') {
        Write-Info "已选择：使用国内镜像"
    }
    else {
        Write-Info "已选择：使用国外官方源"
    }
    # 设置当前进程环境变量（立即生效）
    if (-not $skipApiKey) {
        $env:ANTHROPIC_AUTH_TOKEN = $ApiKey
        $env:ANTHROPIC_API_KEY = $ApiKey
    }
    $env:ANTHROPIC_BASE_URL = $BaseUrl

    # 永久写入当前用户环境变量
    if (-not $skipApiKey) {
        [Environment]::SetEnvironmentVariable('ANTHROPIC_AUTH_TOKEN', $ApiKey, 'User')
        [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', $ApiKey, 'User')
    }
    [Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', $BaseUrl, 'User')

    Write-Success "环境变量已写入当前用户配置"

    # 可选：写入机器级（需要管理员权限）
    $isAdmin = ([bool](New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
    if ($isAdmin -and (-not $skipApiKey)) {
        try {
            [Environment]::SetEnvironmentVariable('ANTHROPIC_AUTH_TOKEN', $ApiKey, 'Machine')
            [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', $ApiKey, 'Machine')
            [Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', $BaseUrl, 'Machine')
            Write-Success "检测到管理员权限，已同步写入系统级环境变量"
        }
        catch {
            Write-Warn "系统级环境变量写入失败：$($_.Exception.Message)"
        }
    }
    elseif ($isAdmin) {
        try {
            [Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', $BaseUrl, 'Machine')
            Write-Success "检测到管理员权限，已写入系统级 BaseUrl"
        }
        catch {
            Write-Warn "系统级 BaseUrl 写入失败：$($_.Exception.Message)"
        }
    }
    else {
        Write-Info "如需对所有用户生效，可右键以管理员身份运行后再执行本命令"
    }

    # 先确保 Node.js 22 可用，避免 ReadableStream 报错
    # 对于 Windows，无需镜像变量；对于 WSL/Git Bash/nvm，会在 bash 里处理
    Install-NodeV22
    # 配置 nvm 在新会话自动启用 Node.js v22（若存在）
    Set-NvmDefaultNode

    # 配置 npm registry（根据镜像选择）
    Set-NpmRegistry -MirrorChoice $mirrorChoice

    # 安装 Claude CLI（若未安装）
    Install-ClaudeCLI

    Write-Host ""
    Write-Success "配置完成！请关闭并重新打开 PowerShell 使其在新会话生效。"
    Write-Info    "立即生效（当前会话已就绪），可直接使用相关工具。"

}
catch {
    Write-ErrorMsg "写入环境变量失败：$($_.Exception.Message)"
    exit 1
}

# 友好提示
Write-Host ""
Write-Info "快速验证："
Write-Host "  echo \"BASE_URL=$env:ANTHROPIC_BASE_URL\""
Write-Host "  echo \"TOKEN=$($env:ANTHROPIC_AUTH_TOKEN.Substring(0, [Math]::Min(10, $env:ANTHROPIC_AUTH_TOKEN.Length)))...\""


# 安装完成后重要提示（醒目展示）
Write-Host ""
Write-Host "====================================================" -ForegroundColor Yellow
Write-Host "  重要提示（安装完成后）" -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Yellow
Write-Host "• Windows（PowerShell）：建议 关闭并重新打开 PowerShell 再使用" -ForegroundColor Yellow
Write-Host "  （当前会话已就绪，但为保证新会话也生效，需重新打开）" -ForegroundColor Yellow
Write-Host "• 立即验证（当前窗口）：node -v  和  claude --version" -ForegroundColor Yellow
Write-Host "• 如遇 Node 不是 v22，可新开窗口后重试" -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Yellow

