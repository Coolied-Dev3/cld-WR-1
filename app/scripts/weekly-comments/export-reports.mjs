/**
 * 提出済み週報を抽出して JSON に書き出す(コメント案シート作成の入力データ)。
 *
 *   node scripts/weekly-comments/export-reports.mjs [--week 2026-08-24] [--out <path>]
 *
 * --week を省略した場合は「提出済み週報のうち最新の対象週」を自動で選ぶ。
 * 既にコメントが付いている週報も出力するが、existingComments で判別できる。
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const prisma = new PrismaClient();

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function catPath(c) {
  if (!c) return null;
  return [c.parent?.name, c.name].filter(Boolean).join(" > ");
}

async function main() {
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

  const reports = await prisma.weeklyReport.findMany({
    where: {
      status: { in: ["submitted", "locked"] },
      weekStartDate: new Date(`${week}T00:00:00Z`),
    },
    include: {
      user: { select: { id: true, name: true, role: true } },
      team: { select: { name: true } },
      issues: {
        include: {
          issueCategory: { include: { parent: true } },
          countermeasureCategory: { include: { parent: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
      compliance: true,
      comments: { select: { id: true, userId: true, parentCommentId: true } },
    },
    orderBy: [{ teamId: "asc" }, { userId: "asc" }],
  });

  const out = {
    week,
    exportedAt: new Date().toISOString(),
    reports: reports.map((r) => ({
      reportId: String(r.id),
      week,
      userId: String(r.userId),
      name: r.user.name,
      role: r.user.role,
      team: r.team.name,
      status: r.status,
      selfRating: r.selfRating,
      workSummary: r.workSummary,
      freeComment: r.freeComment,
      compliance: r.compliance
        ? { level: r.compliance.level, content: r.compliance.content }
        : null,
      // 既にコメントが付いている週報を二重投稿しないための目印
      existingComments: r.comments.filter((c) => !c.parentCommentId).length,
      issues: r.issues.map((i) => ({
        issue: catPath(i.issueCategory),
        issueComment: i.issueComment,
        countermeasure: catPath(i.countermeasureCategory),
        countermeasureComment: i.countermeasureComment,
      })),
    })),
  };

  const dest = arg("out", `../comments/reports-${week}.json`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(out, null, 2), "utf8");
  console.log(`対象週 ${week} / ${out.reports.length}件 -> ${dest}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
