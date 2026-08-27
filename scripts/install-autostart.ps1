# 週報管理システム 自動起動の設定(管理者権限で実行すること)
#
#   1. MySQL を Windows サービス (MySQL84) として登録し、自動起動に設定
#   2. アプリを タスクスケジューラ (WeeklyReportApp) に登録し、OS起動時に自動起動
#
# 実行: 管理者権限のPowerShellで
#   powershell -ExecutionPolicy Bypass -File install-autostart.ps1

$ErrorActionPreference = "Stop"

# 実行結果をログに残す(昇格して別ウィンドウで動くため画面が閉じても追える)
New-Item -ItemType Directory -Force "C:\Claude-Work\weekly-report-system\logs" | Out-Null
Start-Transcript -Path "C:\Claude-Work\weekly-report-system\logs\install-autostart.log" -Force | Out-Null

$MysqlBin    = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe"
$MysqlIni    = "C:\ProgramData\MySQL\MySQL Server 8.4\my.ini"
$ServiceName = "MySQL84"
$TaskName    = "WeeklyReportApp"
$StartScript = "C:\Claude-Work\weekly-report-system\scripts\start-app.ps1"

function Info($m) { Write-Host "[INFO] $m" }
function Ok($m)   { Write-Host "[ OK ] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[WARN] $m" -ForegroundColor Yellow }

# --- 管理者権限の確認 ---
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "管理者権限が必要です。PowerShellを「管理者として実行」してから再実行してください。"
    exit 1
}

# ========== 1. MySQL をサービス化 ==========
Info "MySQL をサービスとして登録します..."

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Warn "サービス $ServiceName は既に登録されています(再作成せずに設定のみ更新)"
} else {
    # 手動起動中の mysqld があれば停止(サービスとして起動し直すため)
    $running = Get-Process mysqld -ErrorAction SilentlyContinue
    if ($running) {
        Info "手動起動中の mysqld を停止します..."
        $running | Stop-Process -Force -Confirm:$false
        Start-Sleep -Seconds 5
    }
    & $MysqlBin --install $ServiceName --defaults-file="$MysqlIni"
    if ($LASTEXITCODE -ne 0) { Write-Error "MySQLのサービス登録に失敗しました"; exit 1 }
    Ok "サービス $ServiceName を登録しました"
}

Set-Service -Name $ServiceName -StartupType Automatic
if ((Get-Service $ServiceName).Status -ne "Running") {
    Start-Service $ServiceName
}
Ok "MySQL: $((Get-Service $ServiceName).Status) / スタートアップ: 自動"

# ========== 2. アプリをタスクスケジューラに登録 ==========
Info "アプリの自動起動タスクを登録します..."

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Info "既存のタスクを削除しました"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`""

# トリガーは2つ用意する。
#  1) OS起動時: 通常の再起動で立ち上げる
#  2) 5分ごと : 高速スタートアップ等で(1)が発火しなかった場合や、
#               アプリが落ちた場合に復旧させるための保険
# MultipleInstances = IgnoreNew により、アプリが動いている間は(2)は何もしない。
$triggerBoot = New-ScheduledTaskTrigger -AtStartup
$triggerBoot.Delay = "PT30S"   # OS起動から30秒待ってから実行

$triggerWatch = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 5)

$principalObj = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggerBoot, $triggerWatch `
    -Principal $principalObj -Settings $settings `
    -Description "週報管理システム(Next.js)をOS起動時に自動起動し、5分ごとに稼働を確認して落ちていれば復旧する" | Out-Null

Ok "タスク $TaskName を登録しました(OS起動30秒後 + 5分ごとの稼働確認 / SYSTEMアカウント)"

Write-Host ""
Ok "設定が完了しました。"
Write-Host "  MySQL      : サービス $ServiceName (自動起動)"
Write-Host "  アプリ      : タスク $TaskName (OS起動時 + 5分ごとの稼働確認)"
Write-Host ""
Write-Host "今すぐアプリを起動する場合: Start-ScheduledTask -TaskName $TaskName"
Write-Host "状態の確認             : Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo"
Write-Host "ログ                   : C:\Claude-Work\weekly-report-system\logs\"

Stop-Transcript | Out-Null
