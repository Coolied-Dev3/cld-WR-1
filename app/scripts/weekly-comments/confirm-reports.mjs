/**
 * 対象週の提出済み週報をまとめて「確認済み」にする。
 *
 *   node scripts/weekly-comments/confirm-reports.mjs --week 2026-08-24 [--author 13] [--dry-run]
 *
 * 画面の「確認済みにする」(src/app/(app)/reports/[id]/actions.ts の confirmReport)と同じく
 * report_confirmations への登録と audit_logs への記録を行う。
 *
 * 次の週報は対象外。
 *   - 本人の週報(画面と同じく自分の週報は確認済みにできない)
 *   - 閲覧権限のない週報(所属長は自分の事業室のみ)
 *   - 既にその人が確認済みの週報(確認日時はそのまま。--force で更新できる)
 *
 * コメント登録(apply-comments.mjs)でも同時に確認済みにするが、
 * シートに載っていない週報も含めて締めたいときはこちらを使う。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const authorId = BigInt(arg("author", "13"));

  const author = await prisma.user.findUnique({ where: { id: authorId } });
  if (!author || !author.isActive) throw new Error(`確認者(id=${authorId})が見つかりません`);
  if (!["manager", "executive"].includes(author.role)) {
    throw new Error(`${author.name} のロール(${author.role})では確認できません`);
  }

  let week = arg("week");
  if (!week) {
    const latest = await prisma.weeklyReport.findFirst({
      where: { status: { in: ["submitted", "locked"] } },
      orderBy: { weekStartDate: "desc" },
      select: { weekStartDate: true },
    });
    if (!latest) throw new Error("提出済みの週報がありません");
    week = latest.weekStartDate.toISOString().slice(0, 10);
  }

  // 所属長は自分の事業室のみ
  const ownTeamId =
    author.role === "manager"
      ? (await prisma.teamMembership.findFirst({
          where: { userId: authorId, endDate: null },
          select: { teamId: true },
        }))?.teamId ?? null
      : null;

  const reports = await prisma.weeklyReport.findMany({
    where: {
      weekStartDate: new Date(`${week}T00:00:00Z`),
      status: { in: ["submitted", "locked"] },
      ...(ownTeamId ? { teamId: ownTeamId } : {}),
    },
    include: {
      user: { select: { name: true } },
      team: { select: { name: true } },
      confirmations: { where: { userId: authorId }, select: { id: true } },
    },
    orderBy: [{ teamId: "asc" }, { userId: "asc" }],
  });

  const targets = [];
  console.log(`確認者: ${author.name} (${author.role}, id=${authorId}) / 対象週: ${week}`);
  for (const r of reports) {
    const label = `週報${r.id} ${r.team.name} / ${r.user.name}`;
    if (r.userId === authorId) {
      console.log(`  [対象外] ${label} : 本人の週報`);
    } else if (r.confirmations.length > 0 && !force) {
      console.log(`  [対象外] ${label} : 既に確認済み`);
    } else {
      console.log(`  [確認済みにする] ${label}`);
      targets.push(r);
    }
  }

  if (dryRun) {
    console.log(`\n--dry-run のため登録していません(対象 ${targets.length}件 / 週報 ${reports.length}件)`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const r of targets) {
      await tx.reportConfirmation.upsert({
        where: { reportId_userId: { reportId: r.id, userId: authorId } },
        update: { confirmedAt: new Date() },
        create: { reportId: r.id, userId: authorId },
      });
      await tx.auditLog.create({
        data: {
          userId: authorId,
          action: "report.confirm",
          targetType: "weekly_reports",
          targetId: r.id,
          detail: { source: "confirm-reports", week },
        },
      });
    }
  });

  console.log(`\n確認済みにしました: ${targets.length}件 / 対象週の週報 ${reports.length}件`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
