# 週報管理システム アプリ起動スクリプト(タスクスケジューラから実行される)
#
# 既に起動していれば何もせずに終了し、起動していなければ
# MySQLの起動を待ってから Next.js を本番モードで立ち上げる。
# タスクは「OS起動時」に加えて5分ごとにも実行されるため、
# アプリが落ちた場合はこのスクリプトが自動的に復旧させる役割も持つ。
#
# ログは logs\app-YYYYMMDD.log に追記される。

$ErrorActionPreference = "Stop"

$AppDir  = "C:\Claude-Work\weekly-report-system\app"
$NodeExe = "C:\Program Files\nodejs\node.exe"
$NextBin = Join-Path $AppDir "node_modules\next\dist\bin\next"
$LogDir  = "C:\Claude-Work\weekly-report-system\logs"
$Port    = 3000
$DbHost  = "127.0.0.1"
$DbPort  = 3306

function Test-Port($targetHost, $port) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $c.Connect($targetHost, $port)
        $c.Close()
        return $true
    } catch {
        return $false
    }
}

# --- 既に起動している場合は何もしない ---
# 5分ごとに実行されるため、ここでログを書くと肥大化する。静かに終了する。
if (Test-Port "127.0.0.1" $Port) { exit 0 }

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
    if (Test-Port $DbHost $DbPort) { $dbReady = $true; break }
    Start-Sleep -Seconds 3
}
if (-not $dbReady) {
    Write-Log "エラー: MySQL($DbHost`:$DbPort)に接続できません。起動を中止します。"
    exit 1
}
Write-Log "MySQLの起動を確認しました"

# --- 起動直前にもう一度確認(同時実行対策) ---
if (Test-Port "127.0.0.1" $Port) {
    Write-Log "ポート $Port は既に使用中のため終了します"
    exit 0
}

# --- .env を環境変数に反映する ---
# next start は .env を読み込まないため、ここで明示的に設定する。
# (DATABASE_URL が効いているのは Prisma が独自に .env を読むためで、
#  COOKIE_SECURE のようにアプリ側で参照する値は反映されない)
$envFile = Join-Path $AppDir ".env"
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile -Encoding UTF8) {
        $t = $line.Trim()
        if (-not $t -or $t.StartsWith("#") -or -not $t.Contains("=")) { continue }
        $pair = $t -split "=", 2
        $key = $pair[0].Trim()
        $val = $pair[1].Trim().Trim('"')
        [Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
    Write-Log ".env を読み込みました"
}

# --- Next.js を本番モードで起動 ---
Set-Location $AppDir
$env:NODE_ENV = "production"
Write-Log "Next.js を起動します (port $Port)"
& $NodeExe $NextBin start --port $Port *>&1 | ForEach-Object { Write-Log $_ }
Write-Log "Next.js が終了しました (exit code: $LASTEXITCODE)"
exit $LASTEXITCODE
