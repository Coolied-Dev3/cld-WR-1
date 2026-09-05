# 週報管理システム DB日次バックアップ
# タスクスケジューラ(WeeklyReportDbBackup)で毎日実行する
# 保存先は OneDrive 同期フォルダ(クラウド側にも複製される)
#
# 出力ファイル: cld_Wr_YYYY-MM-DD_HHmmss.sql
# 保持期間:     $keepDays 日より古いものは自動削除
# 実行ログ:     C:\Claude-Work\weekly-report-system\logs\backup.log

$ErrorActionPreference = "Stop"

$mysqldump = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqldump.exe"
$backupDir = "C:\Users\701-CAMM4-CL-1\OneDrive - クーリード株式会社\72_cld週報system"
$keepDays  = 30
$logFile   = "C:\Claude-Work\weekly-report-system\logs\backup.log"

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Write-Output $line
    New-Item -ItemType Directory -Force (Split-Path $logFile) | Out-Null
    [System.IO.File]::AppendAllText($logFile, $line + "`r`n", [System.Text.Encoding]::UTF8)
}

try {
    # DATABASE_URL から接続情報を取得
    $envFile = "C:\Claude-Work\weekly-report-system\app\.env"
    $dbUrl = (Get-Content $envFile | Where-Object { $_ -match "^DATABASE_URL" }) -replace '^DATABASE_URL="?([^"]+)"?$', '$1'
    if ($dbUrl -match 'mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/(\w+)') {
        $dbUser = $Matches[1]; $dbPass = $Matches[2]; $dbHost = $Matches[3]; $dbPort = $Matches[4]; $dbName = $Matches[5]
    } else {
        throw "DATABASE_URL を解析できませんでした: $envFile"
    }

    if (-not (Test-Path $backupDir)) {
        throw "保存先フォルダが見つかりません(OneDriveの同期状態を確認してください): $backupDir"
    }

    $stamp   = Get-Date -Format "yyyy-MM-dd_HHmmss"
    $outFile = Join-Path $backupDir "cld_Wr_$stamp.sql"

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

    $size = (Get-Item $outFile).Length
    if ($size -lt 1KB) { throw "バックアップファイルが小さすぎます: $outFile ($size bytes)" }

    # 古い世代を削除($keepDays 日より古い cld_Wr_*.sql)
    $old = @(Get-ChildItem $backupDir -Filter "cld_Wr_*.sql" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$keepDays) })
    foreach ($f in $old) { $f.Delete() }

    Log "OK  $outFile ($size bytes) / 古いファイル削除: $($old.Count) 件"
    exit 0
}
catch {
    $env:MYSQL_PWD = $null
    Log "NG  $($_.Exception.Message)"
    exit 1
}
