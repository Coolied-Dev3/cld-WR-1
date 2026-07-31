/**
 * 動作確認用のテストデータを作成する。
 *
 *   node prisma/seed-testdata.mjs [--reset]
 *
 *   --reset を付けると既存のトランザクションデータ(週報・コメント・確認・
 *   モラル報告・閲覧ログ・通知履歴・監査ログ)を全削除してから作成する。
 *   ユーザー・事業室・マスタ・システム設定は削除しない。
 *
 * 作成内容: メンバー2名・所属長2名について直近4週分の週報。
 *   評価をばらつかせ、課題・対策はマスタから選択。所属長→メンバー、役員→所属長の
 *   コメントと、本人からの返信も登録する。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RESET = process.argv.includes("--reset");

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JSTの今日を UTC0時のDateで返す */
function jstToday() {
  const now = new Date(Date.now() + JST_OFFSET_MS);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function weekStartOf(d) {
  const r = new Date(d);
  const day = r.getUTCDay();
  r.setUTCDate(r.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return r;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
function label(d) {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}週`;
}

// テスト対象(メールで指定。ロールはDBの値を使う)
const TARGETS = [
  { email: "k.hosaka@coolied.co.jp", kind: "member" },
  { email: "k.hama@coolied.co.jp", kind: "member" },
  { email: "k.yamada@coolied.co.jp", kind: "manager" },
  { email: "a.takusagawa@coolied.co.jp", kind: "manager" },
];

// 週ごとの内容(新しい週が配列の先頭)
const WEEKLY = {
  "k.hosaka@coolied.co.jp": [
    { rating: "good", work: "・制作案件A/Bの進行管理\n・デザイン修正対応 5件", issue: "納期遵守・短納期対応", cm: "前倒し着手・早期対応", ic: "短納期案件が重なり確認時間が取りにくい", cc: "依頼受領当日に着手して余裕を作る" },
    { rating: "fair", work: "・キャンペーンLPの制作\n・素材差し替え対応", issue: "複数案件の同時進行・業務集中", cm: "優先順位付け", ic: "3案件が同週に集中し残業が増えた", cc: "納期とボリュームで着手順を決める" },
    { rating: "excellent", work: "・定期更新物の制作完了\n・素材整理", issue: "ミス・チェック漏れの発生", cm: "確認・セルフチェックの徹底", ic: "自分だけの確認で見落としリスクがある", cc: "公開前にチェックリストで確認する" },
    { rating: "good", work: "・新規案件のヒアリング同席\n・見積用の工数見積", issue: "先方の情報提供・発注・回答の遅延", cm: "コミュニケーション頻度向上・催促", ic: "仕様確定の回答待ちで着手できない期間があった", cc: "確認事項をまとめて期限付きで依頼する" },
  ],
  "k.hama@coolied.co.jp": [
    { rating: "good", work: "・機能改修の実装とテスト\n・不具合対応 3件", issue: "品質維持と確認時間の確保", cm: "チェック時間の確保", ic: "テスト観点が担当者ごとにばらついている", cc: "観点表を作成してレビューを通す" },
    { rating: "good", work: "・API連携部分の実装\n・コードレビュー対応", issue: "先方との認識齟齬・コミュニケーション不足", cm: "先方との認識合わせ・打合せ実施", ic: "実装中の仕様変更で手戻りが発生", cc: "変更時は影響範囲を提示して合意を取る" },
    { rating: "fair", work: "・障害調査と暫定対応\n・原因分析", issue: "環境構築・障害対応", cm: "原因の切り分け・調査による問題解決", ic: "原因特定に想定以上の時間がかかった", cc: "ログ出力を増やし調査しやすくする" },
    { rating: "excellent", work: "・リファクタリング\n・ドキュメント整備", issue: "属人化・代替要員の不在", cm: "手順書・チェックリストの整備／更新", ic: "実装の経緯が個人の記憶に依存している", cc: "設計判断の背景をドキュメントに残す" },
  ],
  "k.yamada@coolied.co.jp": [
    { rating: "good", work: "・制作室の案件進捗確認とリソース調整\n・新規案件の見積作成", issue: "業務間の工数バランス調整", cm: "メンバーへの振り分け・分担", ic: "特定メンバーに案件が集中している", cc: "案件の割り振りを週次で見直す" },
    { rating: "excellent", work: "・月次の稼働集計\n・協力会社との調整", issue: "進捗・タスク・優先順位の管理", cm: "進捗管理表・タスク管理の運用", ic: "案件ごとの進捗が見えにくい", cc: "管理表を日次で更新し朝会で確認する" },
    { rating: "good", work: "・メンバー面談の実施\n・案件レビュー", issue: "メンバーの育成・教育", cm: "面談・傾聴によるメンバーのケア", ic: "日常業務に追われ育成時間が取れない", cc: "隔週で面談枠を固定して確保する" },
    { rating: "fair", work: "・繁忙期の体制検討\n・見積精度の見直し", issue: "見積精度・価格設定", cm: "見積精度の向上・適正価格の提示", ic: "見積と実績の乖離が続いている", cc: "実績工数を記録し次回見積に反映する" },
  ],
  "a.takusagawa@coolied.co.jp": [
    { rating: "good", work: "・開発案件の進捗管理\n・技術検討会の実施", issue: "新技術・新ツールの検証と導入判断", cm: "技術検証・PoCの実施", ic: "既存構成のまま進めるか判断が必要", cc: "小規模に試作して比較検討する" },
    { rating: "good", work: "・要件整理と設計レビュー\n・メンバーの相談対応", issue: "指示・依頼内容の伝達", cm: "チームMTGでの合意形成", ic: "要件の解釈に担当者間で差がある", cc: "定義書を作成し関係者で合意する" },
    { rating: "fair", work: "・リリース準備\n・検証環境の整備", issue: "制作ルール・仕様の未整備／不統一", cm: "ルール・標準品質の明確化", ic: "リリース手順が個人の手順書頼りになっている", cc: "手順を標準化しリハーサルを行う" },
    { rating: "excellent", work: "・保守案件の棚卸し\n・自動化スクリプト作成", issue: "業務の効率化・自動化", cm: "マクロ・スクリプトによる自動化", ic: "定型作業に毎週工数を取られている", cc: "スクリプト化して工数を削減する" },
  ],
};

async function reset() {
  await prisma.complianceViewLog.deleteMany();
  await prisma.complianceReport.deleteMany();
  await prisma.reportIssue.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.reportConfirmation.deleteMany();
  await prisma.weeklyReport.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.auditLog.deleteMany();
  console.log("トランザクションデータを削除しました(ユーザー・事業室・マスタ・設定は保持)");
}

/** 名称から課題/対策マスタのIDを引く(見つからなければ中断) */
async function findCategory(model, name, kind) {
  const c = await model.findFirst({ where: { name, parentId: { not: null } } });
  if (!c) throw new Error(`${kind}マスタに「${name}」が見つかりません`);
  return c;
}

async function main() {
  if (RESET) {
    const before = await prisma.weeklyReport.count();
    console.log(`既存の週報 ${before}件`);
    await reset();
  }

  const weeks = [0, 1, 2, 3].map((i) => addDays(weekStartOf(jstToday()), -7 * i)); // 新しい順
  const created = [];

  for (const t of TARGETS) {
    const user = await prisma.user.findUnique({
      where: { email: t.email },
      include: { memberships: { where: { endDate: null } } },
    });
    if (!user) throw new Error(`ユーザーが見つかりません: ${t.email}`);
    const membership = user.memberships[0];
    if (!membership) throw new Error(`${user.name} は事業室に所属していません`);

    for (const [i, weekStart] of weeks.entries()) {
      const src = WEEKLY[t.email][i];
      const issueCat = await findCategory(prisma.issueCategory, src.issue, "課題");
      const cmCat = await findCategory(prisma.countermeasureCategory, src.cm, "対策");
      // 金曜17時台に提出したことにする
      const submittedAt = new Date(addDays(weekStart, 4).getTime() + (17 - 9) * 3600 * 1000 + i * 7 * 60000);

      const report = await prisma.weeklyReport.upsert({
        where: { userId_weekStartDate: { userId: user.id, weekStartDate: weekStart } },
        update: {},
        create: {
          userId: user.id,
          teamId: membership.teamId,
          weekStartDate: weekStart,
          status: "submitted",
          workSummary: src.work,
          selfRating: src.rating,
          submittedAt,
          issues: {
            create: [
              {
                issueCategoryId: issueCat.id,
                issueComment: src.ic,
                countermeasureCategoryId: cmCat.id,
                countermeasureComment: src.cc,
                sortOrder: 0,
              },
            ],
          },
          compliance: { create: { level: "none" } },
        },
      });
      created.push({ user, report, weekStart, kind: t.kind });
    }
  }

  // ---- コメント: 直近週の週報に、所属長→メンバー / 役員→所属長 ----
  const leaders = await prisma.teamMembership.findMany({
    where: { isLeader: true, endDate: null },
    include: { user: true },
  });
  const exec = await prisma.user.findFirst({ where: { role: "executive", isActive: true } });

  for (const c of created.filter((x) => x.weekStart.getTime() === weeks[0].getTime())) {
    const commenter =
      c.kind === "member"
        ? leaders.find((l) => l.teamId === c.report.teamId && l.userId !== c.user.id)?.user
        : exec;
    if (!commenter) continue;

    const parent = await prisma.comment.create({
      data: {
        reportId: c.report.id,
        userId: commenter.id,
        content:
          c.kind === "member"
            ? "対応ありがとうございます。負荷が高い状態が続くようなら早めに共有してください。"
            : "状況の共有ありがとうございます。体制面で必要な支援があれば相談してください。",
      },
    });
    await prisma.comment.create({
      data: {
        reportId: c.report.id,
        userId: c.user.id,
        parentCommentId: parent.id,
        content: "承知しました。引き続き進捗を共有します。",
      },
    });
    await prisma.reportConfirmation.upsert({
      where: { reportId_userId: { reportId: c.report.id, userId: commenter.id } },
      update: {},
      create: { reportId: c.report.id, userId: commenter.id },
    });
  }

  // ---- 結果表示 ----
  console.log(`\n週報 ${await prisma.weeklyReport.count()}件 / コメント ${await prisma.comment.count()}件 / 確認 ${await prisma.reportConfirmation.count()}件\n`);
  const all = await prisma.weeklyReport.findMany({
    include: { user: true, team: true, _count: { select: { comments: true } } },
    orderBy: [{ userId: "asc" }, { weekStartDate: "desc" }],
  });
  const marks = { excellent: "◎", good: "○", fair: "△", poor: "✕" };
  let last = "";
  for (const r of all) {
    if (r.user.name !== last) {
      console.log(`■ ${r.user.name} (${r.team.name} / ${r.user.role})`);
      last = r.user.name;
    }
    console.log(`   ${label(r.weekStartDate)}  ${marks[r.selfRating]}  コメント${r._count.comments}件`);
  }
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
