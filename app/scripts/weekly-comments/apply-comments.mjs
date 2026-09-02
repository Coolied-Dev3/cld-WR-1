/**
 * 確認済みのコメントを comments テーブルへ登録し、あわせて週報を「確認済み」にする。
 *
 *   node scripts/weekly-comments/apply-comments.mjs <sheet.json> [--author 13] [--dry-run] [--no-confirm]
 *
 * read-sheet.py の出力を入力にとる。--dry-run では登録内容の確認だけを行いDBは変更しない。
 * 画面からのコメント投稿・確認(src/app/(app)/reports/[id]/actions.ts の addComment /
 * confirmReport)と同じく comments・report_confirmations への登録と audit_logs への記録を
 * 行うが、Teams通知は送らない。
 *
 * コメントは次の週報をスキップする。
 *   - 投稿者本人の週報(画面と同じくトップレベルのコメントは付けられない)
 *   - 同じ投稿者のトップレベルのコメントが既にある週報(二重投稿の防止)
 *
 * 「確認済み」は、コメントが二重投稿で見送られた週報にも付ける(既に確認済みなら日時を更新)。
 * 投稿者本人の週報と閲覧権限のない週報は、画面と同じく確認済みにできない。
 * --no-confirm を付けるとコメント登録だけを行う。
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("入力JSONを指定してください");
  const dryRun = process.argv.includes("--dry-run");
  const confirmToo = !process.argv.includes("--no-confirm");
  const authorId = BigInt(arg("author", "13"));

  const author = await prisma.user.findUnique({ where: { id: authorId } });
  if (!author || !author.isActive) throw new Error(`投稿者(id=${authorId})が見つかりません`);
  if (!["manager", "executive"].includes(author.role)) {
    throw new Error(`投稿者 ${author.name} のロール(${author.role})ではコメントできません`);
  }

  const { items } = JSON.parse(readFileSync(input, "utf8"));
  const plan = [];

  for (const item of items) {
    const reportId = BigInt(item.reportId);
    const report = await prisma.weeklyReport.findUnique({
      where: { id: reportId },
      include: {
        user: { select: { name: true } },
        team: { select: { name: true } },
        comments: { where: { userId: authorId, parentCommentId: null }, select: { id: true } },
      },
    });

    const label = report ? `${report.team.name} / ${report.user.name}` : item.name;
    if (!report) {
      plan.push({ ...item, action: "skip", confirm: false, reason: "週報が見つかりません" });
    } else if (report.userId === authorId) {
      plan.push({ ...item, action: "skip", confirm: false, label, reason: "投稿者本人の週報" });
    } else if (author.role === "manager" && report.teamId !== (await teamIdOf(authorId))) {
      plan.push({ ...item, action: "skip", confirm: false, label, reason: "所属外の事業室の週報" });
    } else if (report.comments.length > 0) {
      // コメントは見送るが、確認済みにはする
      plan.push({
        ...item,
        action: "skip",
        confirm: confirmToo,
        reportId,
        label,
        reason: "同じ投稿者のコメントが既にあります",
      });
    } else {
      plan.push({ ...item, action: "create", confirm: confirmToo, reportId, label });
    }
  }

  const creates = plan.filter((p) => p.action === "create");
  const skips = plan.filter((p) => p.action === "skip");
  const confirms = plan.filter((p) => p.confirm);

  console.log(`投稿者: ${author.name} (${author.role}, id=${authorId})`);
  for (const p of plan) {
    const head = p.action === "create" ? "登録" : `コメント見送り(${p.reason})`;
    const mark = p.confirm ? " +確認済み" : "";
    console.log(`  [${head}${mark}] 週報${p.reportId} ${p.label ?? p.name} : ${p.content.slice(0, 40)}...`);
  }

  if (dryRun) {
    console.log(
      `\n--dry-run のため登録していません(コメント ${creates.length}件 / 確認済み ${confirms.length}件 / 見送り ${skips.length}件)`,
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of creates) {
      const comment = await tx.comment.create({
        data: { reportId: p.reportId, userId: authorId, parentCommentId: null, content: p.content },
      });
      await tx.auditLog.create({
        data: {
          userId: authorId,
          action: "comment.create",
          targetType: "comments",
          targetId: p.reportId,
          detail: { commentId: String(comment.id), source: "weekly-comments-sheet" },
        },
      });
    }
    for (const p of confirms) {
      await tx.reportConfirmation.upsert({
        where: { reportId_userId: { reportId: p.reportId, userId: authorId } },
        update: { confirmedAt: new Date() },
        create: { reportId: p.reportId, userId: authorId },
      });
      await tx.auditLog.create({
        data: {
          userId: authorId,
          action: "report.confirm",
          targetType: "weekly_reports",
          targetId: p.reportId,
          detail: { source: "weekly-comments-sheet" },
        },
      });
    }
  });

  console.log(
    `\n登録しました: コメント ${creates.length}件 / 確認済み ${confirms.length}件 / コメント見送り ${skips.length}件`,
  );
}

/** 所属長が現在所属している事業室(コメント可能な範囲の判定用) */
async function teamIdOf(userId) {
  const m = await prisma.teamMembership.findFirst({
    where: { userId, endDate: null },
    select: { teamId: true },
  });
  return m?.teamId ?? null;
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
