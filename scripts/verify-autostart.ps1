# 自動起動設定の確認(管理者権限で実行すること)
# タスクとサービスの設定内容を表示し、実際に起動するところまで確認する。

$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force "C:\Claude-Work\weekly-report-system\logs" | Out-Null
Start-Transcript -Path "C:\Claude-Work\weekly-report-system\logs\verify-autostart.log" -Force | Out-Null

$TaskName = "WeeklyReportApp"

Write-Host "=== MySQL サービス ==="
Get-Service MySQL84 | Select-Object Name, Status, StartType | Format-List

Write-Host "=== タスク設定 ==="
$t = Get-ScheduledTask -TaskName $TaskName
Write-Host "状態           : $($t.State)"
Write-Host "実行アカウント : $($t.Principal.UserId)"
Write-Host "多重起動       : $($t.Settings.MultipleInstances)"
foreach ($tr in $t.Triggers) {
    $kind = $tr.CimClass.CimClassName -replace "MSFT_Task", "" -replace "Trigger", ""
    $rep  = if ($tr.Repetition.Interval) { " / 繰り返し $($tr.Repetition.Interval)" } else { "" }
    $dly  = if ($tr.Delay) { " / 遅延 $($tr.Delay)" } else { "" }
    Write-Host "トリガー       : $kind$dly$rep"
}
Write-Host "実行内容       : $($t.Actions[0].Execute) $($t.Actions[0].Arguments)"

Write-Host ""
Write-Host "=== 実行結果 ==="
Get-ScheduledTaskInfo -TaskName $TaskName |
    Select-Object LastRunTime, LastTaskResult, NextRunTime, NumberOfMissedRuns | Format-List

Write-Host "=== アプリの応答確認 ==="
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 5
        Write-Host "HTTP $($r.StatusCode) - 応答しました"
        $ok = $true
        break
    } catch {
        if ($i -eq 0) {
            Write-Host "応答がないためタスクを起動します..."
            Start-ScheduledTask -TaskName $TaskName
        }
        Start-Sleep -Seconds 3
    }
}
if (-not $ok) { Write-Host "エラー: アプリが応答しませんでした。logs\app-*.log を確認してください。" }

Write-Host "=== node プロセス ==="
Get-Process node -ErrorAction SilentlyContinue |
    Select-Object Id, StartTime | Format-Table -AutoSize

Stop-Transcript | Out-Null
