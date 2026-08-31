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
node prisma/seed.mjs                                                 # システム設定(何度実行しても安全)
node prisma/import-roster.mjs  prisma/roster.json            --reset # 社員データ(--reset で既存を全削除)
node prisma/import-masters.mjs prisma/masters.json           --reset # 課題・対策マスタ(一般)
node prisma/import-masters.mjs prisma/masters-executive.json --reset # 課題・対策マスタ(役員)
node prisma/add-other-categories.mjs                                 # 各マスタに「その他」を追加(マスタ投入後に実行)
node prisma/seed-testdata.mjs --reset                                # 動作確認用テストデータ(本番運用時は実行しない)
```

| ファイル | 内容 | Git |
|---|---|:-:|
| `prisma/roster.json` | 社員名簿。**平文パスワードを含む**ため除外 | ✕ |
| `prisma/masters.json` | 課題・対策マスタ(一般: メンバー・所属長用) | ○ |
| `prisma/masters-executive.json` | 課題・対策マスタ(役員用: 経営課題) | ○ |

課題・対策マスタは**適用範囲(scope)**を持ち、週報入力時にロールで自動的に切り替わります。
`import-masters.mjs --reset` はJSON内の `scope` に一致するマスタだけを削除するため、
役員用を入れ替えても一般用は消えません。

`add-other-categories.mjs` は、どの分類を選んでも「その他」を選べるようにするための補助スクリプトです。
既存の各大分類の末尾に内容「その他」を、さらに末尾に大分類「その他 > その他」を追加します。
既にある場合は追加しないため、何度実行しても安全です。
**マスタを入れ替えた後は都度実行してください**(JSONには含めず、投入後に付与する運用)。

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
| アプリ | タスクスケジューラ(OS起動の30秒後 + 5分ごとの稼働確認、SYSTEMアカウント) | `WeeklyReportApp` |

アプリは `scripts\start-app.ps1` 経由で起動します。このスクリプトは
MySQLの起動を最大180秒待ってから Next.js を本番モードで起動します。

タスクのトリガーは2つあります。

1. **OS起動時**(30秒遅延) — 通常の再起動で立ち上げる
2. **5分ごと** — 稼働確認。既に動いていれば何もせず、落ちていれば起動し直す

2つ目があるのは、Windowsの**高速スタートアップ**が有効な環境では、
シャットダウンからの電源投入時に「システム起動時」トリガーが発火しないことがあるためです。
これにより、アプリが異常終了した場合も5分以内に自動復旧します。
多重起動は `IgnoreNew` で抑止しているため、稼働中は5分ごとのトリガーは何もしません。

ログは `logs\app-YYYYMMDD.log` に出力されます(稼働中は記録されず、起動したときだけ追記)。

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

> mysqldump の出力は `--result-file` で直接ファイルに書き出しています。
> PowerShell のパイプ(`| Out-File`)を経由すると、コンソールのエンコーディング(CP932)で
> 解釈されて日本語が壊れ、**リストアできないダンプ**になるためです。

復元手順(検証用DBに戻して中身を確認する例):

```powershell
$dump  = (Get-ChildItem C:\Backup\weekly-report\*.sql | Sort-Object LastWriteTime -Desc)[0].FullName
$mysql = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe"
& $mysql -u root -p --host=127.0.0.1 -e "CREATE DATABASE weekly_report_verify CHARACTER SET utf8mb4 COLLATE utf8mb4_ja_0900_as_cs;"
Get-Content $dump | & $mysql -u root -p --host=127.0.0.1 weekly_report_verify
```

### 3.6 トランザクションデータの削除

テスト運用から本番運用に切り替える際など、週報のデータだけを消したい場合に使います。
**実行前に必ずバックアップを取得してください。**

```powershell
cd C:\Claude-Work\weekly-report-system\app
node prisma/clear-transactions.mjs            # 削除対象の件数を表示するだけ(削除しない)
node prisma/clear-transactions.mjs --confirm  # 実際に削除する
```

| 削除される | 削除されない |
|---|---|
| 週報 / 課題・対策 / モラル報告 / 閲覧ログ / コメント / 確認状況 / 通知履歴 / 監査ログ | ユーザー / 事業室 / 所属履歴 / 課題マスタ / 対策マスタ / 提出不要週 / システム設定 |

## 4. Teams通知の設定(Power Automate Workflows)

通知先のTeamsチャネルでWebhookを1つ作成し、そのURLをシステムに登録するだけです(所要5分程度)。

### 手順

1. Teamsで通知を受け取りたい**チャネル**を開き、チャネル名の右の「…」→**「ワークフロー」**を選択
2. テンプレート一覧から**「Webhook 要求を受信したときにチャネルに投稿する」**を選択
3. ワークフロー名(例: `週報システム通知`)を入力し、サインインを確認して**「次へ」**
4. 投稿先のチーム・チャネルを確認して**「ワークフローの追加」**
5. 表示された **Webhook URL**(`https://prod-….logic.azure.com/…`)をコピー
6. 週報システムに**管理者でログイン** → 「管理」→「システム設定」→ Webhook URL欄に貼り付けて**「保存」**
7. **「テスト送信」**を押し、Teamsのチャネルに通知が届けば完了

> - URLは後から画面で確認できないため控えておくことを推奨します(再取得はPower Automateから)
> - URLが未設定の間、通知は送信されません(システム自体は通常どおり動作します)
> - 旧「Incoming Webhook(コネクタ)」はMicrosoftが廃止を進めているため使用しません
> - 送信結果は「システム設定」画面の通知履歴で確認できます

### 通知の種類

| タイミング | 宛先 | 内容 |
|---|---|---|
| リマインダー日時(既定: 当週の金曜 10:00) | 未提出者 | 提出リマインダー |
| 締切日時の超過(既定: 当週の金曜 18:00) | 未提出者+所属長 | 未提出アラート、低評価連続アラート |
| コメント投稿時 | 週報の本人 | コメント通知 |
| 週報提出時 | 所属長(複数いれば全員) | 提出通知 |
| 提出状況画面の「リマインド」 | 対象者 | 手動リマインダー |

リマインダー・締切の日時は「管理」→「週・締切設定」で変更できます(下記参照)。

## 4-1. 提出締切の設定

締切日は「対象週の月曜日から何日後か」で管理しており、**当週の金曜〜翌週の金曜**の範囲で選べます。

| 設定 | 例(対象週が 7/27〜8/2 の場合) |
|---|---|
| 当週の金曜(既定) | 7/31(金) |
| 翌週の月曜 | 8/3(月) |
| 翌週の火曜 | 8/4(火) |

> **締切を翌週にした場合の挙動**: 締切日までは「前の週」の週報が入力対象になります。
> 例えば締切が翌週の火曜なら、月曜・火曜は前週分を入力し、水曜から当週分に切り替わります。
> ホーム画面と週報入力画面には、そのとき提出対象になっている週が表示されます。

## 4-2. 週報コメントの一括作成(Excelで確認してからDB登録)

提出された週報にまとめてコメントを付けるための仕組み。
**Excelで文面を確認・修正してから**DBに登録する3ステップ構成で、勝手に投稿されることはない。

```powershell
cd C:\Claude-Work\weekly-report-system\app

# 1) 対象週の週報を抽出(--week 省略時は最新の提出週)
node scripts/weekly-comments/export-reports.mjs --week 2026-08-24

# 2) 確認用Excelにシートを追加(シート名=作成日。--sheet 省略時は本日)
python scripts/weekly-comments/build-sheet.py ../comments/reports-2026-08-24.json "C:\Claude-Work\User-data\2026-週報コメント案.xlsx" ../comments/drafts-2026-08-24.json

# --- ここでExcelのいちばん左(最新の日付)のシートを開き、L列「コメント案」を確認・修正。登録しない行はM列を「いいえ」に ---

# 3) Excelを読み取り、内容を確認してから登録(--sheet 省略時は最新の日付シート)
python scripts/weekly-comments/read-sheet.py "C:\Claude-Work\User-data\2026-週報コメント案.xlsx" ../comments/sheet.json
node scripts/weekly-comments/apply-comments.mjs ../comments/sheet.json --dry-run   # 確認のみ
node scripts/weekly-comments/apply-comments.mjs ../comments/sheet.json             # 登録
```

コメント案のブックは **`C:\Claude-Work\User-data\2026-週報コメント案.xlsx`**。
1回の作成につき1シートを追加し、**シート名はコメントを作成した日の日付**(対象週の日付ではない)。

| ファイル | 役割 |
|---|---|
| `export-reports.mjs` | 提出済み週報(本文・課題・対策・コンプラ)をJSONに抽出 |
| `build-sheet.py` | 確認用Excelにシートを追加。**1回の作成につき1シート**(シート名=作成日、新しいシートが左)。編集するのは **L列(コメント案)・M列(登録)・N列(備考)** のみ |
| `read-sheet.py` | 対象シートを読み取り、登録対象(M列=はい かつ コメント案あり)を抽出 |
| `apply-comments.mjs` | `comments` と `audit_logs` に登録。既定の投稿者は小野崎(`--author 13` で変更可) |

- 中間ファイルの出力先 `comments/` は氏名と週報本文を含むため **Gitの管理対象外**。
- 二重投稿の防止として、**同じ投稿者のトップレベルコメントが既にある週報はスキップ**する。
- 投稿者本人の週報もスキップする(画面と同様、本人はトップレベルのコメントを付けられないため)。
- 画面からの投稿と違い、**Teams通知は送らない**(まとめて登録するため)。

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
├─ comments/              … 週報コメント案の作業フォルダ(Git管理外)
└─ app/                   … Next.jsアプリ本体
   ├─ prisma/schema.prisma … DBスキーマ(14テーブル)
   ├─ prisma/seed.mjs      … 初期データ投入
   ├─ scripts/weekly-comments/ … 週報コメントの一括作成(Excel確認→DB登録)
   └─ src/
      ├─ lib/              … 認証・セッション・週計算・通知・統計
      ├─ app/(app)/        … 画面(ホーム/週報/チーム/全社/管理)
      └─ instrumentation.ts … cron起動(Teams自動通知)
```
