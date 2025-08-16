@echo off
setlocal EnableExtensions EnableDelayedExpansion

chcp 65001 >nul 2>nul
title MuskApi.com
echo ====================================
echo    Claude Code 快速安裝向導
echo ====================================
echo.

REM 服务器可在发布前注入令牌；若保持占位，则运行时交互输入
set "API_TOKEN=__API_TOKEN__"
set "API_URL=https://ccapi.muskapi.com/api/"
set "DOWNLOAD_URL=https://pan.quark.cn/s/69989a219958"

REM 检测是否为 64 位系统（兼容 WOW64 情况）
set "IS64=0"
if /I "%PROCESSOR_ARCHITECTURE%"=="AMD64" set "IS64=1"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "IS64=1"
if defined PROCESSOR_ARCHITEW6432 set "IS64=1"

if "%IS64%"=="1" goto :CONFIG_ONLY
goto :INSTALL_FULL

:CONFIG_ONLY
echo [信息] 检測到 64 位 Windows 系統，將跳過 Node.js/Git 安裝，僅配置環境變量。
echo.
if /I "%API_TOKEN%"=="__API_TOKEN__" set "API_TOKEN="
if not defined API_TOKEN (
  set /p API_TOKEN=请输入 API Token(cr_开头，忘记可到 https://muskapi.com/ 重新兑换)：
)
if not defined API_TOKEN (
  echo [错误] API Token 不能为空！
  goto :CONFIG_ONLY
)

echo [配置] 正在保存環境變量...
setx ANTHROPIC_AUTH_TOKEN "%API_TOKEN%" >nul
setx ANTHROPIC_BASE_URL "%API_URL%" >nul
setx ANTHROPIC_API_KEY "%API_TOKEN%" >nul
echo [成功] 已為當前用戶配置環境變量！

echo.
echo [下一步] 請打開以下鏈接，下載並雙擊運行即可使用：
echo %DOWNLOAD_URL%
start "" "%DOWNLOAD_URL%" >nul 2>nul

echo.
echo 完成。請關閉並重新打開 PowerShell 後使用 ^(或直接雙擊下載的程序^)。
pause
exit /b 0

:INSTALL_FULL
echo [信息] 未檢測到 64 位系統，將安裝 Git 與 Node.js（可能需要管理員權限）。
echo.

REM 優先使用 winget 安裝
winget --version >nul 2>nul
if %errorlevel%==0 (
  echo [安裝] 正在通過 winget 安裝 Git...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
  if not %errorlevel%==0 echo [警告] winget 安裝 Git 可能失敗，稍後會嘗試手動安裝。

  echo [安裝] 正在通過 winget 安裝 Node.js...
  winget install -e --id OpenJS.NodeJS --accept-source-agreements --accept-package-agreements
  if not %errorlevel%==0 echo [警告] winget 安裝 Node.js 可能失敗，稍後會嘗試手動安裝。
) else (
  echo [信息] 未找到 winget，將使用手動安裝方式。
)

REM 檢查 git 是否可用，否則手動安裝 32 位 Git
git --version >nul 2>nul
if not %errorlevel%==0 (
  echo [安裝] 正在下載並安裝 Git（32 位）...
  set "GIT_URL=https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/Git-2.47.1-32-bit.exe"
  set "GIT_EXE=%TEMP%\git-setup.exe"
  powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%GIT_URL%' -OutFile '%GIT_EXE%'; Start-Process '%GIT_EXE%' -ArgumentList '/VERYSILENT','/NORESTART','/NOCANCEL','/SP-','/CLOSEAPPLICATIONS','/RESTARTAPPLICATIONS' -Wait } catch { exit 1 }"
  if not %errorlevel%==0 echo [错误] Git 自動安裝失敗，請手動從 https://git-scm.com/download/win 下載安裝。
)

REM 檢查 node 是否可用，否則手動安裝 32 位 Node.js（使用 v18 LTS x86）
node --version >nul 2>nul
if not %errorlevel%==0 (
  echo [安裝] 正在下載並安裝 Node.js（32 位 LTS v18）...
  set "NODE_URL=https://nodejs.org/dist/v18.20.4/node-v18.20.4-x86.msi"
  set "NODE_MSI=%TEMP%\nodejs-x86.msi"
  powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%'; Start-Process 'msiexec.exe' -ArgumentList '/i','%NODE_MSI%','/quiet','/norestart' -Wait } catch { exit 1 }"
  if not %errorlevel%==0 echo [错误] Node.js 自動安裝失敗，請手動從 https://nodejs.org/ 下載 32 位版本安裝。
)

echo.
if /I "%API_TOKEN%"=="__API_TOKEN__" set "API_TOKEN="
if not defined API_TOKEN (
  set /p API_TOKEN=请输入 API Token(cr_开头，忘记可到 https://muskapi.com/ 重新兑换)：
)
if not defined API_TOKEN (
  echo [错误] API Token 不能为空！
  goto :INSTALL_FULL
)

echo [配置] 正在保存環境變量...
setx ANTHROPIC_AUTH_TOKEN "%API_TOKEN%" >nul
setx ANTHROPIC_BASE_URL "%API_URL%" >nul
setx ANTHROPIC_API_KEY "%API_TOKEN%" >nul
echo [成功] 已為當前用戶配置環境變量！

echo.
echo [完成] 請重啟終端後使用；如安裝失敗，請以管理員身份重新運行本文件。
pause
exit /b 0


