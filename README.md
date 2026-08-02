# クーリード 週報管理システム

社内向け週報の提出・確認・統計を一元管理するWebアプリケーション。

- **技術構成**: Next.js 16(App Router)+ Prisma + MySQL 8.4 / Node.js 24(Dockerなし)
- **ドキュメント**: [docs/01_要件定義書.md](docs/01_要件定義書.md) / [docs/02_DB設計書.md](docs/02_DB設計書.md) / [docs/03_画面設計書.md](docs/03_画面設計書.md)
- **アプリ本体**: `app/`

## 1. 必要環境

| ソフトウェア | バージョン | 備考 |
|---|---|---|
| Node.js | 24.x(LTS) | `winget install OpenJS.NodeJS.LTS` |
| MySQL Server | 8.4 | `winget install Oracle.MySQL` |

## 2. 起動手順(開発)

```powershell
# 1) MySQL起動(サービス未登録の場合)
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --defaults-file="C:\ProgramData\MySQL\MySQL Server 8.4\my.ini"

# 2) アプリ起動
cd C:\Claude-Work\weekly-report-system\app
npm run dev        # http://localhost:3000
```

`app/.env` に `DATABASE_URL`(MySQL接続情報)と `SESSION_SECRET` が設定済み。

### 登録済みアカウント

2026年7月末時点の社員一覧(20名)+ システム管理者1名を登録済み。
ログインIDは各自の会社メールアドレス、パスワードは社員一覧表(Userdata配下のExcel)を参照。

| ロール | 人数 | 備考 |
|---|---|---|
| 役員(executive) | 2 | 全社の週報閲覧・コメント・全社ダッシュボード |
| 所属長(manager) | 6 | 自事業室の週報閲覧・コメント。開発室・制作室は各2名 |
| メンバー(member) | 12 | 自分の週報のみ |
| 管理者(admin) | 1 | `admin@coolied.local`。ユーザー・事業室・マスタの保守用。週報の閲覧権限は持たない |

事業室(5): 役員 / 制作室 / 開発室 / 教育運営室 / 技術部

**パスワードは平文で管理されます**(ローカル運用の割り切り)。管理者は「ユーザー管理」画面で
全ユーザーのパスワードを確認できます。DBファイルとバックアップへのアクセス制限は必ず維持してください。

### データの投入方法

```powershell
node prisma/seed.mjs                                       # システム設定(何度実行しても安全)
node prisma/import-roster.mjs  prisma/roster.json  --reset # 社員データ(--reset で既存を全削除)
node prisma/import-masters.mjs prisma/masters.json --reset # 課題・対策マスタ(--reset で既存を全削除)
node prisma/seed-testdata.mjs --reset                      # 動作確認用テストデータ(本番運用時は実行しない)
```

| ファイル | 内容 | Git |
|---|---|:-:|
| `prisma/roster.json` | 社員名簿。**平文パスワードを含む**ため除外 | ✕ |
| `prisma/masters.json` | 課題・対策マスタ(個人情報を含まない) | ○ |

`masters.json` は `MasterData` フォルダの「課題・対策マスタ_YYYYMMDD.xlsx」から生成しています。
マスタを差し替える場合は、Excelの「課題マスタ」「対策マスタ」シートから同じ形式のJSONを作り、
`import-masters.mjs --reset` で投入してください。

> **注意**: `import-masters.mjs --reset` は既存マスタを削除するため、
> マスタを参照している週報の課題・対策(`report_issues`)も併せて削除されます。
> 運用開始後にマスタを入れ替える場合は、`--reset` を付けずに追加登録するか、
> 事前にバックアップを取得してください。

## 3. 本番運用手順

### 3.1 MySQLをWindowsサービスとして登録(管理者権限のPowerShellで実行)

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --install MySQL84 --defaults-file="C:\ProgramData\MySQL\MySQL Server 8.4\my.ini"
Start-Service MySQL84
Set-Service MySQL84 -StartupType Automatic
```

### 3.2 rootパスワード

**設定済み(2026-07-22)。** パスワードは社内のパスワード管理台帳を参照してください。
変更する場合:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p --host=127.0.0.1 -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '新しいパスワード';"
```

### 3.3 アプリのビルドと自動起動(設定済み)

PC再起動時に MySQL とアプリが自動起動するよう設定済みです。

| 対象 | 方式 | 名前 |
|---|---|---|
| MySQL | Windowsサービス(スタートアップ: 自動) | `MySQL84` |
| アプリ | タスクスケジューラ(OS起動の30秒後、SYSTEMアカウント) | `WeeklyReportApp` |

アプリは `scripts\start-app.ps1` 経由で起動します。このスクリプトは
MySQLの起動を最大180秒待ってから Next.js を本番モードで起動し、
ポート3000が使用中の場合は二重起動を避けて終了します。
ログは `logs\app-YYYYMMDD.log` に出力されます。

**コードを更新したら再ビルドが必要です**(タスクは本番ビルドを起動するため):

```powershell
cd C:\Claude-Work\weekly-report-system\app
npm run build
```

#### 自動起動の再設定・確認(管理者権限が必要)

```powershell
powershell -ExecutionPolicy Bypass -File C:\Claude-Work\weekly-report-system\scripts\install-autostart.ps1
powershell -ExecutionPolicy Bypass -File C:\Claude-Work\weekly-report-system\scripts\verify-autostart.ps1
```

#### 手動での起動・停止(管理者権限が必要)

```powershell
Start-ScheduledTask -TaskName WeeklyReportApp      # 起動
Get-Process node | Stop-Process -Force             # 停止
Get-ScheduledTask -TaskName WeeklyReportApp | Get-ScheduledTaskInfo   # 状態確認
```

> **PowerShellスクリプトの文字コード**: 日本語コメントを含むため、必ず **UTF-8(BOM付き)** で保存してください。
> BOMなしだと Windows PowerShell 5.1 が文字化けし、構文エラーで起動しません。

### 3.4 HTTPS化(推奨)

ハラスメント報告を扱うため、社内LANでもHTTPS化を推奨します。
IISのリバースプロキシ(ARR)またはCaddy/nginxを前段に置き、社内CA証明書を設定してください。
HTTPS化したら `app/.env` に `COOKIE_SECURE=1` を追加します。

### 3.5 バックアップ(日次)

`scripts/backup.ps1` をタスクスケジューラで毎日実行してください(例: 毎日 2:00)。
保存先は既定で `C:\Backup\weekly-report`。**必ずNAS等の別筐体にもコピーしてください。**

```powershell
powershell -ExecutionPolicy Bypass -File C:\Claude-Work\weekly-report-system\scripts\backup.ps1
```

## 4. Teams通知の設定(Power Automate Workflows)

1. Teamsの通知先チャネルで「…」→「ワークフロー」を開く
2. テンプレート「**Webhook 要求を受信したときにチャネルに投稿する**」を選択して作成
3. 発行されたURLをコピー
4. 週報システムに管理者でログイン →「システム設定」→ Webhook URLに貼り付けて保存
5. 「テスト送信」でチャネルに通知が届くことを確認

URLが未設定の間、通知は送信されません(システム自体は通常どおり動作します)。

### 通知の種類

| タイミング | 内容 |
|---|---|
| 金曜 リマインダー時刻(既定10:00) | 未提出者へ提出リマインダー |
| 金曜 締切時刻超過(既定18:00) | 未提出者+所属長へアラート、低評価連続アラート |
| コメント投稿時 | 週報の本人へ通知 |
| 週報提出時 | 所属長へ通知 |
| 提出状況画面の「リマインド送信」 | 手動リマインダー |

## 5. 運用メモ

- **ユーザー追加**: 管理者「ユーザー管理」から登録。パスワードは管理者が発行・確認できる(平文管理)
- **退職処理**: 「無効化」を使用(過去週報は保持)
- **異動**: 「チーム管理」の所属設定で異動日を指定。過去週報は当時のチームの統計に残る
- **マスタ変更**: 削除不可・無効化のみ(過去統計の保全のため)
- **提出不要週**: 「週・締切設定」でカレンダー登録(年末年始など)
- **締切後の修正**: DBの `weekly_reports.status` を管理者が変更(現状UIなし・要望あれば追加)

## 6. ディレクトリ構成

```
weekly-report-system/
├─ README.md
├─ docs/                  … 要件定義・DB設計・画面設計・モックアップ
├─ scripts/backup.ps1     … 日次バックアップスクリプト
└─ app/                   … Next.jsアプリ本体
   ├─ prisma/schema.prisma … DBスキーマ(14テーブル)
   ├─ prisma/seed.mjs      … 初期データ投入
   └─ src/
      ├─ lib/              … 認証・セッション・週計算・通知・統計
      ├─ app/(app)/        … 画面(ホーム/週報/チーム/全社/管理)
      └─ instrumentation.ts … cron起動(Teams自動通知)
```
