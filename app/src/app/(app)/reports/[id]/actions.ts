"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canViewReport, logAudit } from "@/lib/auth";
import { sendTeamsNotification } from "@/lib/notify";
import { weekLabel } from "@/lib/week";

export async function addComment(formData: FormData) {
  const user = await requireUser(["member", "manager", "executive"]);
  const reportId = BigInt(String(formData.get("reportId")));
  const parentIdRaw = String(formData.get("parentCommentId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  const report = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    include: { user: true },
  });
  if (!report || !canViewReport(user, report)) return;

  const isOwner = report.userId === user.id;
  // 本人は返信のみ可(トップレベルコメントは所属長・役員)
  if (isOwner && !parentIdRaw) return;

  await prisma.comment.create({
    data: {
      reportId,
      userId: user.id,
      parentCommentId: parentIdRaw ? BigInt(parentIdRaw) : null,
      content,
    },
  });
  await logAudit(user.id, "comment.create", "comments", reportId);

  // 通知: 本人以外がコメントしたら週報の本人へ
  if (!isOwner) {
    await sendTeamsNotification("comment", {
      userId: report.userId,
      title: "週報にコメントが届きました",
      body: `${user.name} さんが ${report.user.name} さんの ${weekLabel(report.weekStartDate)} の週報にコメントしました。`,
      mentionEmail: report.user.email,
    });
  }
  revalidatePath(`/reports/${reportId}`);
}

export async function confirmReport(formData: FormData) {
  const user = await requireUser(["manager", "executive"]);
  const reportId = BigInt(String(formData.get("reportId")));
  const report = await prisma.weeklyReport.findUnique({ where: { id: reportId } });
  if (!report || !canViewReport(user, report) || report.userId === user.id) return;

  await prisma.reportConfirmation.upsert({
    where: { reportId_userId: { reportId, userId: user.id } },
    update: { confirmedAt: new Date() },
    create: { reportId, userId: user.id },
  });
  await logAudit(user.id, "report.confirm", "weekly_reports", reportId);
  revalidatePath(`/reports/${reportId}`);
}
