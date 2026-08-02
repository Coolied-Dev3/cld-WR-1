"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/auth";
import { fromDateKey, weekStartOf } from "@/lib/week";
import { sendTeamsNotification } from "@/lib/notify";
import type { Role } from "@prisma/client";

// ---- ユーザー管理 ----

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
  const teamId = String(formData.get("teamId") ?? "");
  if (teamId) {
    await prisma.teamMembership.create({
      data: {
        userId: user.id,
        teamId: BigInt(teamId),
        isLeader: role === "manager",
        startDate: fromDateKey(new Date().toISOString().slice(0, 10)),
      },
    });
  }
  await logAudit(admin.id, "user.create", "users", user.id, { name, email, role });
  revalidatePath("/admin/users");
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

export async function assignMembership(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const userId = BigInt(String(formData.get("userId")));
  const teamId = BigInt(String(formData.get("teamId")));
  const isLeader = formData.get("isLeader") === "on";
  const dateKey = String(formData.get("startDate") ?? "");
  if (!dateKey) return;
  const startDate = fromDateKey(dateKey);

  await prisma.$transaction(async (tx) => {
    // 現所属を終了(異動日の前日)
    const prevEnd = new Date(startDate);
    prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
    await tx.teamMembership.updateMany({
      where: { userId, endDate: null },
      data: { endDate: prevEnd },
    });
    // 1チームに複数の所属長を置けるため、既存の所属長は解除しない
    await tx.teamMembership.create({ data: { userId, teamId, isLeader, startDate } });
  });
  await logAudit(admin.id, "team.assign", "team_memberships", userId, {
    teamId: teamId.toString(),
    isLeader,
    startDate: dateKey,
  });
  revalidatePath("/admin/teams");
}

// ---- マスタ管理 ----

export async function createMasterCategory(formData: FormData) {
  const admin = await requireUser(["admin"]);
  const kind = String(formData.get("kind")); // issue | cm
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const parentIdRaw = String(formData.get("parentId") ?? "");
  if (!name) return;
  const data = { name, description, parentId: parentIdRaw ? BigInt(parentIdRaw) : null };
  const created =
    kind === "issue"
      ? await prisma.issueCategory.create({ data })
      : await prisma.countermeasureCategory.create({ data });
  await logAudit(admin.id, "master.create", kind === "issue" ? "issue_categories" : "countermeasure_categories", created.id, { name });
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
  const keys = ["deadline_time", "reminder_time", "alert_consecutive_low_weeks", "teams_webhook_url"];
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
    title: "クーリード 週報管理システム テスト通知",
    body: `Webhook設定のテスト送信です(実行者: ${admin.name})。この通知が見えていれば設定は正常です。`,
  });
  revalidatePath("/admin/settings");
}
