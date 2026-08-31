"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/auth";
import { getViewableMembers } from "@/lib/team-data";
import { fromDateKey, weekLabel } from "@/lib/week";
import { sendTeamsNotification } from "@/lib/notify";

/** 未提出者へリマインダーを送る。userId 指定時は1名、未指定なら閲覧範囲の未提出者全員 */
export async function sendReminder(formData: FormData) {
  const user = await requireUser(["manager", "executive"]);
  const weekStart = fromDateKey(String(formData.get("week")));
  const targetId = String(formData.get("userId") ?? "");

  const skip = await prisma.skipWeek.findUnique({ where: { weekStartDate: weekStart } });
  if (skip) return;

  // 閲覧できる範囲(所属長=自チーム / 役員=全社)に限定する
  const members = await getViewableMembers(user);
  const submitted = await prisma.weeklyReport.findMany({
    where: { weekStartDate: weekStart, status: { not: "draft" } },
    select: { userId: true },
  });
  const submittedIds = new Set(submitted.map((r) => r.userId.toString()));

  const targets = members.filter(
    (m) => !submittedIds.has(m.id.toString()) && (!targetId || m.id.toString() === targetId)
  );

  for (const m of targets) {
    await sendTeamsNotification("reminder", {
      userId: m.id,
      title: "週報提出のお願い",
      body: `${m.name} さん、${weekLabel(weekStart)} の週報が未提出です。提出をお願いします。`,
      mentionEmail: m.email,
      link: "/reports/edit",
    });
  }
  await logAudit(user.id, "notify.manual_reminder", "users", targetId ? BigInt(targetId) : undefined, {
    week: String(formData.get("week")),
    count: targets.length,
  });
  revalidatePath("/team/status");
}
