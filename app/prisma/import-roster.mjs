/**
 * 社員一覧(JSON)から本番データを一括登録する。
 *
 * 使い方:
 *   node prisma/import-roster.mjs <roster.json> [--reset]
 *
 *   --reset を付けると、既存のユーザー・事業室・週報・コメント・ログを全削除してから登録する。
 *   課題/対策マスタとシステム設定は削除しない。
 *
 * roster.json の形式:
 *   {
 *     "teams": ["役員", "制作室", ...],
 *     "users": [
 *       { "name": "山田 太郎", "email": "...", "password": "...",
 *         "role": "member|manager|executive|admin", "team": "制作室" }
 *     ]
 *   }
 *
 * 注意: このJSONは平文パスワードを含むため、Gitにコミットしないこと(.gitignore済み)。
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const [, , rosterPath, ...flags] = process.argv;
const RESET = flags.includes("--reset");
const START_DATE = new Date("2026-07-01T00:00:00Z"); // 所属開始日

if (!rosterPath) {
  console.error("使い方: node prisma/import-roster.mjs <roster.json> [--reset]");
  process.exit(1);
}

const roster = JSON.parse(readFileSync(rosterPath, "utf8"));

function validate() {
  const errors = [];
  const seenEmail = new Set();
  const validRoles = ["member", "manager", "executive", "admin"];

  for (const [i, u] of roster.users.entries()) {
    const at = `users[${i}] ${u.name ?? "(名前なし)"}`;
    if (!u.name) errors.push(`${at}: name が空です`);
    if (!u.email) errors.push(`${at}: email が空です`);
    if (!u.password) errors.push(`${at}: password が空です`);
    if (!validRoles.includes(u.role)) errors.push(`${at}: role が不正です (${u.role})`);
    if (u.role !== "admin" && !u.team) errors.push(`${at}: team が空です`);
    if (u.team && !roster.teams.includes(u.team)) errors.push(`${at}: 未定義の事業室 (${u.team})`);
    if (seenEmail.has(u.email)) errors.push(`${at}: email が重複しています (${u.email})`);
    seenEmail.add(u.email);
  }
  if (errors.length) {
    console.error("入力データにエラーがあります:");
    for (const e of errors) console.error("  -", e);
    process.exit(1);
  }
}

async function reset() {
  // 外部キーの依存順に削除する
  await prisma.complianceViewLog.deleteMany();
  await prisma.complianceReport.deleteMany();
  await prisma.reportIssue.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.reportConfirmation.deleteMany();
  await prisma.weeklyReport.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  console.log("既存データを削除しました(課題/対策マスタ・システム設定は保持)");
}

async function main() {
  validate();

  if (RESET) {
    const before = await prisma.user.count();
    console.log(`削除対象の既存ユーザー: ${before}名`);
    await reset();
  }

  // ---- 事業室 ----
  const teams = {};
  for (const name of roster.teams) {
    const existing = await prisma.team.findFirst({ where: { name } });
    teams[name] = existing ?? (await prisma.team.create({ data: { name } }));
  }
  console.log(`事業室: ${roster.teams.length}件 (${roster.teams.join(", ")})`);

  // ---- ユーザーと所属 ----
  for (const u of roster.users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, password: u.password, role: u.role, isActive: true },
      create: {
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role,
        mustChangePassword: false,
      },
    });
    if (u.team) {
      const current = await prisma.teamMembership.findFirst({
        where: { userId: user.id, endDate: null },
      });
      const isLeader = u.role === "manager";
      if (!current) {
        await prisma.teamMembership.create({
          data: { userId: user.id, teamId: teams[u.team].id, startDate: START_DATE, isLeader },
        });
      } else if (current.teamId !== teams[u.team].id || current.isLeader !== isLeader) {
        await prisma.teamMembership.update({
          where: { id: current.id },
          data: { teamId: teams[u.team].id, isLeader },
        });
      }
    }
  }

  // ---- 結果表示 ----
  const result = await prisma.team.findMany({
    orderBy: { id: "asc" },
    include: {
      memberships: {
        where: { endDate: null },
        include: { user: true },
        orderBy: [{ isLeader: "desc" }, { userId: "asc" }],
      },
    },
  });
  console.log(`\n登録結果: ユーザー ${await prisma.user.count()}名\n`);
  for (const t of result) {
    console.log(`■ ${t.name} (${t.memberships.length}名)`);
    for (const m of t.memberships) {
      const mark = m.isLeader ? "所属長" : m.user.role === "executive" ? "役員  " : "メンバー";
      console.log(`   ${mark}  ${m.user.name}  <${m.user.email}>`);
    }
  }
  const noTeam = await prisma.user.findMany({ where: { memberships: { none: { endDate: null } } } });
  if (noTeam.length) {
    console.log(`\n■ 事業室なし (${noTeam.length}名)`);
    for (const u of noTeam) console.log(`   ${u.role}  ${u.name}  <${u.email}>`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
