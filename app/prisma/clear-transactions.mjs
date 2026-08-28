/**
 * トランザクションデータ(週報とそれに紐づく記録)を全削除する。
 *
 *   node prisma/clear-transactions.mjs --confirm
 *
 * 削除するもの:
 *   週報 / 課題・対策 / モラル報告 / モラル報告の閲覧ログ /
 *   コメント / 確認状況 / 通知履歴 / 監査ログ
 *
 * 削除しないもの(マスタ・設定):
 *   ユーザー / 事業室 / 所属履歴 / 課題マスタ / 対策マスタ /
 *   提出不要週 / システム設定
 *
 * 実行前に必ずDBバックアップを取得すること(scripts\backup.ps1)。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRMED = process.argv.includes("--confirm");

async function counts() {
  return {
    週報: await prisma.weeklyReport.count(),
    "課題・対策": await prisma.reportIssue.count(),
    モラル報告: await prisma.complianceReport.count(),
    モラル報告の閲覧ログ: await prisma.complianceViewLog.count(),
    コメント: await prisma.comment.count(),
    確認状況: await prisma.reportConfirmation.count(),
    通知履歴: await prisma.notificationLog.count(),
    監査ログ: await prisma.auditLog.count(),
  };
}

async function keptCounts() {
  return {
    ユーザー: await prisma.user.count(),
    事業室: await prisma.team.count(),
    所属履歴: await prisma.teamMembership.count(),
    課題マスタ: await prisma.issueCategory.count(),
    対策マスタ: await prisma.countermeasureCategory.count(),
    提出不要週: await prisma.skipWeek.count(),
    システム設定: await prisma.appSetting.count(),
  };
}

function show(title, obj) {
  console.log(title);
  for (const [k, v] of Object.entries(obj)) console.log(`  ${k}: ${v}件`);
}

async function main() {
  show("=== 削除対象(削除前) ===", await counts());
  console.log();
  show("=== 保持するデータ ===", await keptCounts());

  if (!CONFIRMED) {
    console.log("\n実行するには --confirm を付けてください。");
    console.log("  node prisma/clear-transactions.mjs --confirm");
    return;
  }

  console.log("\n削除を実行します...");
  // 外部キーの依存順に削除する
  await prisma.complianceViewLog.deleteMany();
  await prisma.complianceReport.deleteMany();
  await prisma.reportIssue.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.reportConfirmation.deleteMany();
  await prisma.weeklyReport.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.auditLog.deleteMany();

  console.log();
  show("=== 削除後 ===", await counts());
  console.log();
  show("=== 保持されたデータ ===", await keptCounts());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
