"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team-data";
import { currentWeekStart, weekLabel } from "@/lib/week";
import { sendTeamsNotification } from "@/lib/notify";

export async function sendManualReminder(formData: FormData) {
  const user = await requireUser(["manager", "executive"]);
  const teamId = BigInt(String(formData.get("teamId")));

  // 所属長は自チームのみ
  if (user.role === "manager" && !user.memberships.some((m) => m.isLeader && m.teamId === teamId)) {
    return;
  }

  const weekStart = currentWeekStart();
  const members = await getTeamMembers(teamId);
  const submitted = await prisma.weeklyReport.findMany({
    where: { teamId, weekStartDate: weekStart, status: { not: "draft" } },
    select: { userId: true },
  });
  const submittedIds = new Set(submitted.map((r) => r.userId.toString()));
  const unsubmitted = members.filter((m) => !submittedIds.has(m.id.toString()));

  for (const m of unsubmitted) {
    await sendTeamsNotification("reminder", {
      userId: m.id,
      title: "週報提出のお願い",
      body: `${m.name} さん、${weekLabel(weekStart)} の週報が未提出です。提出をお願いします。`,
      mentionEmail: m.email,
    });
  }
  await logAudit(user.id, "notify.manual_reminder", "teams", teamId, {
    count: unsubmitted.length,
  });
  revalidatePath("/team/status");
}
