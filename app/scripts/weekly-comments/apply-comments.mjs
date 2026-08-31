/**
 * 確認済みのコメントを comments テーブルへ登録する。
 *
 *   node scripts/weekly-comments/apply-comments.mjs <sheet.json> [--author 13] [--dry-run]
 *
 * read-sheet.py の出力を入力にとる。--dry-run では登録内容の確認だけを行いDBは変更しない。
 * 画面からのコメント投稿(src/app/(app)/reports/[id]/actions.ts の addComment)と同じく
 * comments への登録と audit_logs への記録を行うが、Teams通知は送らない。
 *
 * 次の週報はスキップする。
 *   - 投稿者本人の週報(画面と同じくトップレベルのコメントは付けられない)
 *   - 同じ投稿者のトップレベルのコメントが既にある週報(二重投稿の防止)
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

    if (!report) {
      plan.push({ ...item, action: "skip", reason: "週報が見つかりません" });
    } else if (report.userId === authorId) {
      plan.push({ ...item, action: "skip", reason: "投稿者本人の週報" });
    } else if (report.comments.length > 0) {
      plan.push({ ...item, action: "skip", reason: "同じ投稿者のコメントが既にあります" });
    } else if (author.role === "manager" && report.teamId !== (await teamIdOf(authorId))) {
      plan.push({ ...item, action: "skip", reason: "所属外の事業室の週報" });
    } else {
      plan.push({
        ...item,
        action: "create",
        reportId,
        label: `${report.team.name} / ${report.user.name}`,
      });
    }
  }

  const creates = plan.filter((p) => p.action === "create");
  const skips = plan.filter((p) => p.action === "skip");

  console.log(`投稿者: ${author.name} (${author.role}, id=${authorId})`);
  for (const p of plan) {
    const head = p.action === "create" ? "登録" : `スキップ(${p.reason})`;
    console.log(`  [${head}] 週報${p.reportId} ${p.label ?? p.name} : ${p.content.slice(0, 40)}...`);
  }

  if (dryRun) {
    console.log(`\n--dry-run のため登録していません(登録予定 ${creates.length}件 / スキップ ${skips.length}件)`);
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
  });

  console.log(`\n登録しました: ${creates.length}件 / スキップ ${skips.length}件`);
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
