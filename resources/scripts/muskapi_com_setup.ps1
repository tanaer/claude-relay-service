# Claude Code Installation Script (Auto-filled by server)
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "   Claude Code 快速安装向导         " -ForegroundColor White
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 注入的 API Token（由服务端生成下载时替换）
$apiToken = "__API_TOKEN__"

# Check PowerShell version
if ($PSVersionTable.PSVersion.Major -lt 3) {
    Write-Host "[错误] 需要 PowerShell 3.0 或更高版本" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

# Check Git Bash
Write-Host "[检查] 正在检测 Git Bash..." -ForegroundColor Yellow
try {
    $gitPath = Get-Command git -ErrorAction SilentlyContinue
    if ($gitPath) {
        $gitVersion = git --version 2>$null
        Write-Host "[成功] 已安装 Git：$gitVersion" -ForegroundColor Green
        $bashPath = Join-Path (Split-Path (Split-Path $gitPath.Source)) "bin\bash.exe"
        if (Test-Path $bashPath) {
            Write-Host "[成功] 已找到 Git Bash：$bashPath" -ForegroundColor Green
            [System.Environment]::SetEnvironmentVariable("CLAUDE_CODE_GIT_BASH_PATH", $bashPath, "User")
        }
    }
    else {
        throw "未找到 Git"
    }
}
catch {
    Write-Host "[警告] 未安装 Git" -ForegroundColor Yellow
    Write-Host "[安装] 正在安装 Git..." -ForegroundColor Cyan
    $wingetInstalled = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetInstalled) {
        Write-Host "[信息] 通过 winget 安装 Git..." -ForegroundColor Yellow
        winget install Git.Git --accept-source-agreements --accept-package-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $gitDefaultPath = "C:\\Program Files\\Git\\bin\\bash.exe"
        if (Test-Path $gitDefaultPath) {
            [System.Environment]::SetEnvironmentVariable("CLAUDE_CODE_GIT_BASH_PATH", $gitDefaultPath, "User")
            Write-Host "[成功] Git 已安装并完成配置！" -ForegroundColor Green
        }
    }
    else {
        Write-Host "[信息] 正在下载 Git 安装程序..." -ForegroundColor Yellow
        $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/Git-2.47.1-64-bit.exe"
        $installerPath = "$env:TEMP\git-installer.exe"
        try {
            Invoke-WebRequest -Uri $gitUrl -OutFile $installerPath
            Write-Host "[信息] 正在安装 Git..." -ForegroundColor Yellow
            Start-Process $installerPath -ArgumentList "/VERYSILENT", "/NORESTART", "/NOCANCEL", "/SP-", "/CLOSEAPPLICATIONS", "/RESTARTAPPLICATIONS" -Wait
            Remove-Item $installerPath -Force
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            $gitDefaultPath = "C:\\Program Files\\Git\\bin\\bash.exe"
            if (Test-Path $gitDefaultPath) {
                [System.Environment]::SetEnvironmentVariable("CLAUDE_CODE_GIT_BASH_PATH", $gitDefaultPath, "User")
                Write-Host "[成功] Git 已安装并完成配置！" -ForegroundColor Green
            }
        }
        catch {
            Write-Host "[错误] 自动安装 Git 失败" -ForegroundColor Red
            Write-Host "[信息] 请从此处手动安装：https://git-scm.com/downloads/win" -ForegroundColor Cyan
            Write-Host "[信息] 安装完成后，请设置环境变量 CLAUDE_CODE_GIT_BASH_PATH" -ForegroundColor Yellow
        }
    }
}

# Check Node.js
Write-Host "[检查] 正在检测 Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host "[成功] 已安装 Node.js：$nodeVersion" -ForegroundColor Green
    }
    else {
        throw "未找到 Node.js"
    }
}
catch {
    Write-Host "[警告] 未安装 Node.js" -ForegroundColor Yellow
    Write-Host "[安装] 正在安装 Node.js..." -ForegroundColor Cyan
    $wingetInstalled = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetInstalled) {
        Write-Host "[信息] 通过 winget 安装 Node.js..." -ForegroundColor Yellow
        winget install OpenJS.NodeJS --accept-source-agreements --accept-package-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    }
    else {
        Write-Host "[信息] 正在下载 Node.js 安装程序..." -ForegroundColor Yellow
        $nodeUrl = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-x64.msi"
        $installerPath = "$env:TEMP\nodejs-installer.msi"
        try {
            Invoke-WebRequest -Uri $nodeUrl -OutFile $installerPath
            Write-Host "[信息] 正在安装 Node.js..." -ForegroundColor Yellow
            $installProcess = Start-Process msiexec.exe -ArgumentList "/i", "`"$installerPath`"", "/quiet", "/norestart", "/l*v", "`"$env:TEMP\nodejs-install.log`"" -Wait -PassThru
            if ($installProcess.ExitCode -ne 0) {
                Write-Host "[错误] MSI 安装程序返回错误码：$($installProcess.ExitCode)" -ForegroundColor Red
                $logPath = "$env:TEMP\nodejs-install.log"
                if (Test-Path $logPath) {
                    Write-Host "[错误] 安装日志：" -ForegroundColor Red
                    Get-Content $logPath -Tail 20 | Write-Host
                }
                Write-Host "[信息] 正在尝试备用安装方式..." -ForegroundColor Yellow
                $altProcess = Start-Process msiexec.exe -ArgumentList "/i", "`"$installerPath`"", "/passive", "ADDLOCAL=ALL" -Wait -PassThru
                if ($altProcess.ExitCode -ne 0) {
                    throw "Node.js installation failed with both methods"
                }
            }
            if (Test-Path $installerPath) { Remove-Item $installerPath -Force -ErrorAction SilentlyContinue }
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            Write-Host "[信息] 正在等待 Node.js 生效..." -ForegroundColor Yellow
            Start-Sleep -Seconds 3
        }
        catch {
            Write-Host "[错误] 自动安装 Node.js 失败：$_" -ForegroundColor Red
            Write-Host "[信息] 请从此处手动安装：https://nodejs.org/" -ForegroundColor Cyan
            if (Test-Path $installerPath) {
                Write-Host "[信息] 正在打开安装程序，请手动完成安装..." -ForegroundColor Yellow
                Start-Process $installerPath
                Write-Host "[信息] 请完成手动安装后再次运行本脚本" -ForegroundColor Cyan
            }
            Read-Host "按回车退出"
            exit 1
        }
    }
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-Host "[成功] Node.js 安装完成：$nodeVersion" -ForegroundColor Green
        }
        else {
            throw "Node.js 安装校验失败"
        }
    }
    catch {
        Write-Host "[错误] Node.js 安装失败" -ForegroundColor Red
        Write-Host "[信息] 请重启 PowerShell 后重新运行本脚本" -ForegroundColor Yellow
        Read-Host "按回车退出"
        exit 1
    }
}

# 配置 API（自动注入令牌，必要时回退到交互输入）
Write-Host "" 
Write-Host "[配置] API 配置" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($apiToken) -or $apiToken -eq '__API_TOKEN__') {
    Write-Host "请输入 API Token：" -ForegroundColor White
    $apiToken = Read-Host
    while ([string]::IsNullOrWhiteSpace($apiToken)) {
        Write-Host "[错误] API Token 不能为空！" -ForegroundColor Red
        Write-Host "请输入 API Token：" -ForegroundColor White
        $apiToken = Read-Host
    }
}
else {
    Write-Host "[信息] 检测到已注入的 API Token，将跳过交互输入" -ForegroundColor Cyan
}

$apiUrl = "https://ccapi.muskapi.com/api/"

Write-Host "" 
Write-Host "[配置] 正在保存配置..." -ForegroundColor Yellow
[System.Environment]::SetEnvironmentVariable("ANTHROPIC_AUTH_TOKEN", $apiToken, "User")
[System.Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", $apiUrl, "User")
[System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", $apiToken, "User")
Write-Host "[成功] 环境变量配置完成！" -ForegroundColor Green

Write-Host "" 
Write-Host "[安装] 正在安装 Claude Code..." -ForegroundColor Yellow
try {
    & cmd /c "npm install -g @anthropic-ai/claude-code 2>&1"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[成功] Claude Code 安装完成！" -ForegroundColor Green
    }
    else {
        throw "npm 安装失败"
    }
}
catch {
    Write-Host "[错误] 安装失败：$_" -ForegroundColor Red
}

Write-Host "" 
Write-Host "[配置] 正在设置 PowerShell 执行策略..." -ForegroundColor Yellow
try {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
    Write-Host "[成功] 执行策略设置完成！" -ForegroundColor Green
}
catch {
    Write-Host "[警告] 未能自动设置执行策略" -ForegroundColor Yellow
    Write-Host "[信息] 你可能需要手动运行：" -ForegroundColor Cyan
    Write-Host "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned" -ForegroundColor White
}

Write-Host "" 
Write-Host "使用说明：" -ForegroundColor Cyan
Write-Host "1. 关闭并重新打开 PowerShell" -ForegroundColor White
Write-Host "2. 输入 'claude -i' 开始交互模式" -ForegroundColor White
Write-Host "   或使用 'claude \"你的问题\"' 直接提问" -ForegroundColor White
Write-Host "" 
Read-Host "按回车退出"


