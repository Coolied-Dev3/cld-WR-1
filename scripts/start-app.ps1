# 週報管理システム アプリ起動スクリプト(タスクスケジューラから実行される)
#
# MySQLの起動を待ってから Next.js を本番モードで起動する。
# ログは logs\app-YYYYMMDD.log に追記される。

$ErrorActionPreference = "Stop"

$AppDir  = "C:\Claude-Work\weekly-report-system\app"
$NodeExe = "C:\Program Files\nodejs\node.exe"
$NextBin = Join-Path $AppDir "node_modules\next\dist\bin\next"
$LogDir  = "C:\Claude-Work\weekly-report-system\logs"
$Port    = 3000
$DbHost  = "127.0.0.1"
$DbPort  = 3306

New-Item -ItemType Directory -Force $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("app-" + (Get-Date -Format "yyyyMMdd") + ".log")

function Write-Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

Write-Log "=== 起動処理を開始 ==="

# --- MySQLの起動を待つ(最大180秒) ---
$deadline = (Get-Date).AddSeconds(180)
$dbReady = $false
while ((Get-Date) -lt $deadline) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $c.Connect($DbHost, $DbPort)
        $c.Close()
        $dbReady = $true
        break
    } catch {
        Start-Sleep -Seconds 3
    }
}
if (-not $dbReady) {
    Write-Log "エラー: MySQL($DbHost`:$DbPort)に接続できません。起動を中止します。"
    exit 1
}
Write-Log "MySQLの起動を確認しました"

# --- 既に起動していないか確認 ---
try {
    $c = New-Object Net.Sockets.TcpClient
    $c.Connect("127.0.0.1", $Port)
    $c.Close()
    Write-Log "ポート $Port は既に使用中です。二重起動を避けるため終了します。"
    exit 0
} catch { }

# --- Next.js を本番モードで起動 ---
Set-Location $AppDir
$env:NODE_ENV = "production"
Write-Log "Next.js を起動します (port $Port)"
& $NodeExe $NextBin start --port $Port *>&1 | ForEach-Object { Write-Log $_ }
Write-Log "Next.js が終了しました (exit code: $LASTEXITCODE)"
exit $LASTEXITCODE
