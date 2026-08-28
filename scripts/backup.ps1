# 週報管理システム DB日次バックアップ
# タスクスケジューラで毎日実行することを想定(例: 毎日 2:00)
# 保存先はNAS等の別筐体への複製も必ず行うこと

$ErrorActionPreference = "Stop"

$mysqldump = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqldump.exe"
$backupDir = "C:\Backup\weekly-report"
$keepDays  = 14

# DATABASE_URL から接続情報を取得
$envFile = "C:\Claude-Work\weekly-report-system\app\.env"
$dbUrl = (Get-Content $envFile | Where-Object { $_ -match "^DATABASE_URL" }) -replace '^DATABASE_URL="?([^"]+)"?$', '$1'
if ($dbUrl -match 'mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/(\w+)') {
    $dbUser = $Matches[1]; $dbPass = $Matches[2]; $dbHost = $Matches[3]; $dbPort = $Matches[4]; $dbName = $Matches[5]
} else {
    throw "DATABASE_URL を解析できませんでした: $envFile"
}

New-Item -ItemType Directory -Force $backupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outFile = Join-Path $backupDir "weekly_report_$stamp.sql"

# 出力は --result-file で mysqldump に直接書かせる。
# PowerShell のパイプ(| Out-File)を経由すると、コンソールのエンコーディング(CP932)で
# 解釈されて日本語が壊れ、リストアできないダンプになるため。
$env:MYSQL_PWD = $dbPass
& $mysqldump -u $dbUser --host=$dbHost --port=$dbPort `
    --single-transaction --routines --triggers --no-tablespaces `
    --default-character-set=utf8mb4 --result-file="$outFile" $dbName
$dumpExit = $LASTEXITCODE
$env:MYSQL_PWD = $null
if ($dumpExit -ne 0) { throw "mysqldump が失敗しました (exit code: $dumpExit)" }

if ((Get-Item $outFile).Length -lt 1KB) { throw "バックアップファイルが小さすぎます: $outFile" }

# 古い世代を削除
Get-ChildItem $backupDir -Filter "weekly_report_*.sql" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$keepDays) } |
    Remove-Item -Force

Write-Output "Backup completed: $outFile"
