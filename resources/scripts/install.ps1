Param(
    [string]$ApiKey = "",
    [string]$BaseUrl = ""
)

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

# 从占位符/参数/环境变量解析配置
$InjectedKey = "__API_TOKEN__"
$InjectedBase = "__BASE_URL__"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    if ($InjectedKey -ne "__API_TOKEN__" -and -not [string]::IsNullOrWhiteSpace($InjectedKey)) {
        $ApiKey = $InjectedKey
    }
    elseif ($env:API_KEY) {
        $ApiKey = $env:API_KEY
    }
    elseif ($env:CLAUDE_API_KEY) {
        $ApiKey = $env:CLAUDE_API_KEY
    }
    elseif ($env:ANTHROPIC_AUTH_TOKEN) {
        $ApiKey = $env:ANTHROPIC_AUTH_TOKEN
    }
    elseif ($env:ANTHROPIC_API_KEY) {
        $ApiKey = $env:ANTHROPIC_API_KEY
    }
}

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    if ($InjectedBase -ne "__BASE_URL__" -and -not [string]::IsNullOrWhiteSpace($InjectedBase)) {
        $BaseUrl = $InjectedBase
    }
    elseif ($env:BASE_URL) {
        $BaseUrl = $env:BASE_URL
    }
    elseif ($env:CLAUDE_API_URL) {
        $BaseUrl = $env:CLAUDE_API_URL
    }
    elseif ($env:ANTHROPIC_BASE_URL) {
        $BaseUrl = $env:ANTHROPIC_BASE_URL
    }
    else {
        $BaseUrl = "https://ccapi.muskapi.com/api/"
    }
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
    Write-ErrorMsg "API Key 不能为空。您也可以使用：irm <url>?apiKey=... | iex"
    exit 1
}

Write-Info "即将配置环境变量："
Write-Host "  API_KEY: $($ApiKey.Substring(0, [Math]::Min(10, $ApiKey.Length)))..."
Write-Host "  BASE_URL: $BaseUrl"

try {
    # 设置当前进程环境变量（立即生效）
    $env:ANTHROPIC_AUTH_TOKEN = $ApiKey
    $env:ANTHROPIC_API_KEY = $ApiKey
    $env:ANTHROPIC_BASE_URL = $BaseUrl

    # 永久写入当前用户环境变量
    [Environment]::SetEnvironmentVariable('ANTHROPIC_AUTH_TOKEN', $ApiKey, 'User')
    [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', $ApiKey, 'User')
    [Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', $BaseUrl, 'User')

    Write-Success "环境变量已写入当前用户配置"

    # 可选：写入机器级（需要管理员权限）
    $isAdmin = ([bool](New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
    if ($isAdmin) {
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
    else {
        Write-Info "如需对所有用户生效，可右键以管理员身份运行后再执行本命令"
    }

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


