# 週報管理システム アプリの再起動(管理者権限で実行すること)
#
# 自動起動タスクで動いているアプリを停止し、最新のビルドで起動し直す。
# コードを更新して npm run build した後に実行する。
#
#   powershell -ExecutionPolicy Bypass -File restart-app.ps1
#   powershell -ExecutionPolicy Bypass -File restart-app.ps1 -StopOnly   # 停止のみ

param([switch]$StopOnly)

$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force "C:\Claude-Work\weekly-report-system\logs" | Out-Null
Start-Transcript -Path "C:\Claude-Work\weekly-report-system\logs\restart-app.log" -Force | Out-Null

$TaskName = "WeeklyReportApp"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "管理者権限が必要です。PowerShellを「管理者として実行」してください。"
    Stop-Transcript | Out-Null
    exit 1
}

Write-Host "アプリを停止します..."
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  node PID $($_.Id) を停止"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 3
Write-Host "停止しました"

if ($StopOnly) {
    Write-Host "(-StopOnly のため起動はしません)"
    Stop-Transcript | Out-Null
    exit 0
}

Write-Host "アプリを起動します..."
Start-ScheduledTask -TaskName $TaskName

$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 5
        Write-Host "HTTP $($r.StatusCode) - 起動しました($(($i + 1) * 3)秒)"
        $ok = $true
        break
    } catch { }
}
if (-not $ok) {
    Write-Host "エラー: 起動を確認できませんでした。logs\app-*.log を確認してください。"
}

Stop-Transcript | Out-Null
