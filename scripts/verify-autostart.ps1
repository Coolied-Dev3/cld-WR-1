# 自動起動設定の確認(管理者権限で実行すること)
# タスクを実際に起動し、アプリが応答するところまで確認する。

$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force "C:\Claude-Work\weekly-report-system\logs" | Out-Null
Start-Transcript -Path "C:\Claude-Work\weekly-report-system\logs\verify-autostart.log" -Force | Out-Null

$TaskName = "WeeklyReportApp"

Write-Host "=== MySQL サービス ==="
Get-Service MySQL84 | Select-Object Name, Status, StartType | Format-List

Write-Host "=== タスク設定 ==="
$t = Get-ScheduledTask -TaskName $TaskName
$t | Select-Object TaskName, State | Format-List
Write-Host "実行アカウント : $($t.Principal.UserId)"
Write-Host "トリガー       : $($t.Triggers[0].CimClass.CimClassName) / 遅延 $($t.Triggers[0].Delay)"
Write-Host "実行内容       : $($t.Actions[0].Execute) $($t.Actions[0].Arguments)"

Write-Host "=== タスクを起動して応答を確認 ==="
Start-ScheduledTask -TaskName $TaskName
Write-Host "起動しました。アプリの応答を待ちます(最大90秒)..."

$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 5
        Write-Host "HTTP $($r.StatusCode) - アプリが応答しました($(($i + 1) * 3)秒)"
        $ok = $true
        break
    } catch { }
}
if (-not $ok) { Write-Host "エラー: アプリが応答しませんでした" }

Write-Host "=== タスクの実行結果 ==="
Get-ScheduledTaskInfo -TaskName $TaskName |
    Select-Object LastRunTime, LastTaskResult, NumberOfMissedRuns | Format-List

Write-Host "=== node プロセス ==="
Get-Process node -ErrorAction SilentlyContinue |
    Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize

Write-Host "=== アプリログ(末尾) ==="
$applog = "C:\Claude-Work\weekly-report-system\logs\app-$(Get-Date -Format yyyyMMdd).log"
if (Test-Path $applog) { Get-Content $applog -Tail 10 } else { Write-Host "(ログなし)" }

Stop-Transcript | Out-Null
