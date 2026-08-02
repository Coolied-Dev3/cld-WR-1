"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/auth";
import { weekLabel } from "@/lib/week";
import { getDeadlineSettings, resolveTargetWeek, deadlineAtOf, deadlineDisplay } from "@/lib/deadline";
import { masterScopeFor } from "@/lib/team-data";
import { sendTeamsNotification } from "@/lib/notify";
import type { ComplianceLevel, ComplianceVisibility, SelfRating } from "@prisma/client";

export type SaveState = { error?: string };

export async function saveReport(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const user = await requireUser(["member", "manager", "executive"]);
  const scope = masterScopeFor(user.role);
  const settings = await getDeadlineSettings();
  const weekStart = resolveTargetWeek(settings);

  const skip = await prisma.skipWeek.findUnique({ where: { weekStartDate: weekStart } });
  if (skip) return { error: `この週は提出不要週です(${skip.reason})。` };

  if (new Date() > deadlineAtOf(weekStart, settings.deadlineOffset, settings.deadlineTime)) {
    return { error: `提出締切(${deadlineDisplay(weekStart, settings)})を過ぎています。管理者に連絡してください。` };
  }

  const membership = user.memberships[0];
  if (!membership) return { error: "チームに所属していないため提出できません。管理者に連絡してください。" };

  const submitMode = formData.get("mode") === "submit";
  const workSummary = String(formData.get("workSummary") ?? "").trim();
  const selfRating = String(formData.get("selfRating") ?? "") as SelfRating;
  const freeComment = String(formData.get("freeComment") ?? "").trim() || null;
  const complianceLevel = String(formData.get("complianceLevel") ?? "none") as ComplianceLevel;
  const complianceContent = String(formData.get("complianceContent") ?? "").trim();
  const complianceVisibility = (String(formData.get("complianceVisibility") ?? "") ||
    "manager_and_executive") as ComplianceVisibility;

  if (submitMode) {
    if (!workSummary) return { error: "「今週行ったこと」を入力してください。" };
    if (!["excellent", "good", "fair", "poor"].includes(selfRating))
      return { error: "自己評価を選択してください。" };
    if (complianceLevel !== "none" && !complianceContent)
      return { error: "モラル・ハラスメント欄の内容を入力してください。" };
  }

  const issueCount = Number(formData.get("issueCount") ?? 0);
  const issues: {
    issueCategoryId: bigint;
    issueComment: string | null;
    countermeasureCategoryId: bigint | null;
    countermeasureComment: string | null;
    sortOrder: number;
  }[] = [];
  for (let i = 0; i < issueCount; i++) {
    const catId = String(formData.get(`issue_${i}_categoryId`) ?? "");
    if (!catId) {
      if (submitMode) return { error: `課題${i + 1}の課題分類(小分類)を選択してください。` };
      continue;
    }
    const cmCatId = String(formData.get(`issue_${i}_cmCategoryId`) ?? "");
    issues.push({
      issueCategoryId: BigInt(catId),
      issueComment: String(formData.get(`issue_${i}_comment`) ?? "").trim() || null,
      countermeasureCategoryId: cmCatId ? BigInt(cmCatId) : null,
      countermeasureComment: String(formData.get(`issue_${i}_cmComment`) ?? "").trim() || null,
      sortOrder: i,
    });
  }

  // 画面外から他ロール向けのマスタを送られても登録しないよう、適用範囲を検証する
  if (issues.length > 0) {
    const [validIssues, validCms] = await Promise.all([
      prisma.issueCategory.count({
        where: { scope, id: { in: issues.map((i) => i.issueCategoryId) } },
      }),
      prisma.countermeasureCategory.count({
        where: {
          scope,
          id: { in: issues.map((i) => i.countermeasureCategoryId).filter((v) => v !== null) },
        },
      }),
    ]);
    const cmCount = issues.filter((i) => i.countermeasureCategoryId !== null).length;
    if (validIssues !== issues.length || validCms !== cmCount) {
      return { error: "選択された課題・対策が正しくありません。画面を読み込み直してください。" };
    }
  }

  const existing = await prisma.weeklyReport.findUnique({
    where: { userId_weekStartDate: { userId: user.id, weekStartDate: weekStart } },
  });
  if (existing?.status === "locked") {
    return { error: "この週報はロックされています。修正が必要な場合は管理者に連絡してください。" };
  }

  const status = submitMode ? "submitted" : existing?.status === "submitted" ? "submitted" : "draft";
  const submittedAt = submitMode ? new Date() : existing?.submittedAt ?? null;
  const wasSubmitted = existing?.status === "submitted";

  const report = await prisma.$transaction(async (tx) => {
    const r = existing
      ? await tx.weeklyReport.update({
          where: { id: existing.id },
          data: { workSummary, selfRating: selfRating || "good", freeComment, status, submittedAt },
        })
      : await tx.weeklyReport.create({
          data: {
            userId: user.id,
            teamId: membership.teamId,
            weekStartDate: weekStart,
            workSummary,
            selfRating: selfRating || "good",
            freeComment,
            status,
            submittedAt,
          },
        });
    await tx.reportIssue.deleteMany({ where: { reportId: r.id } });
    if (issues.length > 0) {
      await tx.reportIssue.createMany({ data: issues.map((it) => ({ ...it, reportId: r.id })) });
    }
    await tx.complianceReport.upsert({
      where: { reportId: r.id },
      update: {
        level: complianceLevel,
        content: complianceLevel === "none" ? null : complianceContent,
        visibility: complianceVisibility,
      },
      create: {
        reportId: r.id,
        level: complianceLevel,
        content: complianceLevel === "none" ? null : complianceContent,
        visibility: complianceVisibility,
      },
    });
    return r;
  });

  await logAudit(user.id, submitMode ? "report.submit" : "report.save_draft", "weekly_reports", report.id);

  // 新規提出時のみ所属長へTeams通知(所属長が複数いる場合は全員に送る)
  if (submitMode && !wasSubmitted) {
    const leaders = await prisma.teamMembership.findMany({
      where: { teamId: membership.teamId, isLeader: true, endDate: null, userId: { not: user.id } },
      include: { user: true },
    });
    for (const leader of leaders) {
      await sendTeamsNotification("submitted", {
        userId: leader.userId,
        title: "週報が提出されました",
        body: `${user.name} さんが ${weekLabel(weekStart)} の週報を提出しました。`,
        mentionEmail: leader.user.email,
      });
    }
  }

  redirect(`/reports/${report.id}`);
}
