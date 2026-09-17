"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/auth";
import { fromDateKey, weekStartOf, toDateKey, jstToday } from "@/lib/week";
import { MAX_TEAMS_PER_USER } from "@/lib/team-data";
import { sendTeamsNotification } from "@/lib/notify";
import type { Role, MasterScope } from "@prisma/client";

// ---- ユーザー管理 ----

type TeamInput = { teamId: bigint; isLeader: boolean };

/**
 * フォームの所属欄(team1/leader1, team2/leader2)を読み取る。
 * 空欄は無視し、同じ事業室を2回選んだ場合は1つにまとめる。上限は MAX_TEAMS_PER_USER。
 */
function parseTeamInputs(formData: FormData): TeamInput[] {
  const result: TeamInput[] = [];
  for (let i = 1; i <= MAX_TEAMS_PER_USER; i++) {
    const raw = String(formData.get(`team${i}`) ?? "").trim();
    if (!raw) continue;
    const teamId = BigInt(raw);
    const isLeader = formData.get(`leader${i}`) === "on";
    const dup = result.find((t) => t.teamId === teamId);
    if (dup) dup.isLeader = dup.isLeader || isLeader;
    else result.push({ teamId, isLeader });
  }
  return result;
}

/**
 * 現所属を desired の内容に合わせる。
 * - desired にない現所属は今日付で終了(履歴として残す)
 * - 所属長フラグが変わったものはその場で更新
 * - 新しい事業室は今日付で開始
 */
async function syncMemberships(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: bigint,
  current: { id: bigint; teamId: bigint; isLeader: boolean }[],
  desired: TeamInput[]
) {
  const today = fromDateKey(toDateKey(jstToday()));
  for (const m of current) {
    const d = desired.find((t) => t.teamId === m.teamId);
    if (!d) {
      await tx.teamMembership.update({ where: { id: m.id }, data: { endDate: today } });
    } else if (d.isLeader !== m.isLeader) {
      await tx.teamMembership.update({ where: { id: m.id }, data: { isLeader: d.isLeader } });
    }
  }
  for (const d of desired) {
    if (!current.some((m) => m.teamId === d.teamId)) {
      await tx.teamMembership.create({
        data: { userId, teamId: d.teamId, isLeader: d.isLeader, startDate: today },
      });
    }
  }
}

export async function createUser(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const employeeCode = String(formData.get("employeeCode") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "member") as Role;
  const password = String(formData.get("password") ?? "");
  if (!name || !email || password.length < 8) return;

  const user = await prisma.user.create({
    data: {
      name,
      email,
      employeeCode,
      role,
      password,
      mustChangePassword: false, // 平文管理のため初回変更は強制しない

    },
  });
  // 所属は最大2つ。所属長ロールで「所属長」にチェックがなければ、選んだ事業室すべての所属長にする
  const teams = parseTeamInputs(formData);
  if (role === "manager" && teams.length > 0 && !teams.some((t) => t.isLeader)) {
    for (const t of teams) t.isLeader = true;
  }
  const startDate = fromDateKey(toDateKey(jstToday()));
  for (const t of teams) {
    await prisma.teamMembership.create({
      data: { userId: user.id, teamId: t.teamId, isLeader: t.isLeader, startDate },
    });
  }
  await logAudit(admin.id, "user.create", "users", user.id, {
    name,
    email,
    role,
    teams: teams.map((t) => ({ teamId: t.teamId.toString(), isLeader: t.isLeader })),
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/teams");
}

/** ユーザー情報と所属(最大2つ)をまとめて更新する */
export async function updateUser(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const userId = BigInt(String(formData.get("userId")));
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { where: { endDate: null } } },
  });
  if (!user) return;

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const employeeCode = String(formData.get("employeeCode") ?? "").trim() || null;
  const role = String(formData.get("role") ?? user.role) as Role;
  const password = String(formData.get("password") ?? "").trim();
  if (!name || !email) return;
  if (password && password.length < 8) return;
  const desired = parseTeamInputs(formData);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        employeeCode,
        role,
        ...(password ? { password, mustChangePassword: false } : {}),
      },
    });
    await syncMemberships(tx, userId, user.memberships, desired);
  });
  await logAudit(admin.id, "user.update", "users", userId, {
    name,
    email,
    role,
    passwordChanged: !!password && password !== user.password,
    teams: desired.map((t) => ({ teamId: t.teamId.toString(), isLeader: t.isLeader })),
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/teams");
}

export async function toggleUserActive(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const userId = BigInt(String(formData.get("userId")));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  await prisma.user.update({ where: { id: userId }, data: { isActive: !user.isActive } });
  if (user.isActive) {
    // 無効化時は現所属も終了する
    await prisma.teamMembership.updateMany({
      where: { userId, endDate: null },
      data: { endDate: new Date() },
    });
  }
  await logAudit(admin.id, user.isActive ? "user.deactivate" : "user.update", "users", userId);
  revalidatePath("/admin/users");
}

export async function resetPassword(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const userId = BigInt(String(formData.get("userId")));
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return;
  await prisma.user.update({
    where: { id: userId },
    data: { password, mustChangePassword: false },
  });
  await logAudit(admin.id, "user.update", "users", userId, { action: "reset_password" });
  revalidatePath("/admin/users");
}

// ---- チーム管理 ----

export async function createTeam(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const team = await prisma.team.create({ data: { name } });
  await logAudit(admin.id, "team.create", "teams", team.id, { name });
  revalidatePath("/admin/teams");
}

/**
 * 所属を追加する(他の所属は終了しない)。
 * すでにその事業室に所属していれば所属長フラグだけ更新する。
 * 所属数が上限(MAX_TEAMS_PER_USER)に達している場合は何もしない。
 */
export async function assignMembership(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const userId = BigInt(String(formData.get("userId")));
  const teamId = BigInt(String(formData.get("teamId")));
  const isLeader = formData.get("isLeader") === "on";
  const dateKey = String(formData.get("startDate") ?? "");
  if (!dateKey) return;
  const startDate = fromDateKey(dateKey);

  const current = await prisma.teamMembership.findMany({ where: { userId, endDate: null } });
  const existing = current.find((m) => m.teamId === teamId);
  if (existing) {
    if (existing.isLeader !== isLeader) {
      await prisma.teamMembership.update({ where: { id: existing.id }, data: { isLeader } });
    }
  } else {
    if (current.length >= MAX_TEAMS_PER_USER) return;
    // 1チームに複数の所属長を置けるため、既存の所属長は解除しない
    await prisma.teamMembership.create({ data: { userId, teamId, isLeader, startDate } });
  }
  await logAudit(admin.id, "team.assign", "team_memberships", userId, {
    teamId: teamId.toString(),
    isLeader,
    startDate: dateKey,
  });
  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
}

/** 所属を今日付で終了する(履歴として残す) */
export async function endMembership(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const membershipId = BigInt(String(formData.get("membershipId")));
  const m = await prisma.teamMembership.findUnique({ where: { id: membershipId } });
  if (!m || m.endDate) return;
  await prisma.teamMembership.update({
    where: { id: membershipId },
    data: { endDate: fromDateKey(toDateKey(jstToday())) },
  });
  await logAudit(admin.id, "team.unassign", "team_memberships", m.userId, {
    teamId: m.teamId.toString(),
  });
  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
}

// ---- マスタ管理 ----

export async function createMasterCategory(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const kind = String(formData.get("kind")); // issue | cm
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const parentIdRaw = String(formData.get("parentId") ?? "");
  const scope: MasterScope = String(formData.get("scope")) === "executive" ? "executive" : "general";
  if (!name) return;
  const data = { name, description, scope, parentId: parentIdRaw ? BigInt(parentIdRaw) : null };
  const created =
    kind === "issue"
      ? await prisma.issueCategory.create({ data })
      : await prisma.countermeasureCategory.create({ data });
  await logAudit(admin.id, "master.create", kind === "issue" ? "issue_categories" : "countermeasure_categories", created.id, { name, scope });
  revalidatePath("/admin/masters");
}

/** 名称と説明を更新する */
export async function updateMasterCategory(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const kind = String(formData.get("kind"));
  const id = BigInt(String(formData.get("id")));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name) return;
  const data = { name, description };
  if (kind === "issue") {
    await prisma.issueCategory.update({ where: { id }, data });
  } else {
    await prisma.countermeasureCategory.update({ where: { id }, data });
  }
  await logAudit(admin.id, "master.update", kind === "issue" ? "issue_categories" : "countermeasure_categories", id, { name });
  revalidatePath("/admin/masters");
}

/**
 * 表示順を1つ上/下に入れ替える。
 * 入れ替えは同じ階層の中でのみ行う(大分類どうし、または同じ大分類に属する項目どうし)。
 */
export async function moveMasterCategory(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const kind = String(formData.get("kind"));
  const id = BigInt(String(formData.get("id")));
  const direction = String(formData.get("direction")); // up | down
  const isIssue = kind === "issue";

  const target = isIssue
    ? await prisma.issueCategory.findUnique({ where: { id } })
    : await prisma.countermeasureCategory.findUnique({ where: { id } });
  if (!target) return;

  // 同じ階層かつ同じ適用範囲の兄弟を表示順に並べる
  const where = { parentId: target.parentId, scope: target.scope };
  const orderBy = [{ sortOrder: "asc" as const }, { id: "asc" as const }];
  const siblings = isIssue
    ? await prisma.issueCategory.findMany({ where, orderBy })
    : await prisma.countermeasureCategory.findMany({ where, orderBy });

  const index = siblings.findIndex((s) => s.id === target.id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= siblings.length) return; // 端なので動かせない

  // sortOrder が重複・未設定でも確実に入れ替わるよう、並び全体を振り直す
  const ids = siblings.map((s) => s.id);
  [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];

  await prisma.$transaction(
    ids.map((sid, i) =>
      isIssue
        ? prisma.issueCategory.update({ where: { id: sid }, data: { sortOrder: i } })
        : prisma.countermeasureCategory.update({ where: { id: sid }, data: { sortOrder: i } })
    )
  );

  await logAudit(
    admin.id,
    "master.reorder",
    isIssue ? "issue_categories" : "countermeasure_categories",
    id,
    { direction, name: target.name }
  );
  revalidatePath("/admin/masters");
}

export async function toggleMasterCategory(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const kind = String(formData.get("kind"));
  const id = BigInt(String(formData.get("id")));
  if (kind === "issue") {
    const c = await prisma.issueCategory.findUnique({ where: { id } });
    if (!c) return;
    await prisma.issueCategory.update({ where: { id }, data: { isActive: !c.isActive } });
  } else {
    const c = await prisma.countermeasureCategory.findUnique({ where: { id } });
    if (!c) return;
    await prisma.countermeasureCategory.update({ where: { id }, data: { isActive: !c.isActive } });
  }
  await logAudit(admin.id, "master.toggle", kind === "issue" ? "issue_categories" : "countermeasure_categories", id);
  revalidatePath("/admin/masters");
}

// ---- 週・締切設定 ----

export async function addSkipWeek(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const dateKey = String(formData.get("week") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!dateKey || !reason) return;
  const weekStart = weekStartOf(fromDateKey(dateKey));
  await prisma.skipWeek.upsert({
    where: { weekStartDate: weekStart },
    update: { reason },
    create: { weekStartDate: weekStart, reason },
  });
  await logAudit(admin.id, "skipweek.create", "skip_weeks", undefined, { week: dateKey, reason });
  revalidatePath("/admin/weeks");
}

export async function deleteSkipWeek(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const id = BigInt(String(formData.get("id")));
  await prisma.skipWeek.delete({ where: { id } });
  await logAudit(admin.id, "skipweek.delete", "skip_weeks", id);
  revalidatePath("/admin/weeks");
}

// ---- システム設定 ----

export async function updateSettings(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const keys = [
    "app_base_url",
    "deadline_day_offset",
    "deadline_time",
    "reminder_day_offset",
    "reminder_time",
    "alert_consecutive_low_weeks",
    "teams_webhook_url",
  ];
  for (const key of keys) {
    const value = formData.get(key);
    if (value !== null) {
      await prisma.appSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
  }
  await logAudit(admin.id, "setting.update", "app_settings");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/weeks");
}

export async function testWebhook() {
  const admin = await requireUser(["admin"]);
  await sendTeamsNotification("alert", {
    userId: admin.id,
    title: "クーリード 週報管理システム テスト通知",
    body: `Webhook設定のテスト送信です。この通知が ${admin.name} さん宛のチャットに届いていれば設定は正常です。`,
    mentionEmail: admin.email,
  });
  revalidatePath("/admin/settings");
}
