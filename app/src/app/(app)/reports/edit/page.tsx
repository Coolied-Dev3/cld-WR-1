import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { weekRangeLabel, addDays } from "@/lib/week";
import { getDeadlineSettings, resolveTargetWeek, deadlineAtOf, deadlineDisplay } from "@/lib/deadline";
import { masterScopeFor } from "@/lib/team-data";
import { ReportForm } from "./report-form";
import type { CategoryOption, IssueRow } from "./issues-editor";

async function loadCategories(
  model: "issue" | "cm",
  scope: "general" | "executive"
): Promise<CategoryOption[]> {
  const where = { isActive: true, scope };
  const orderBy = [{ sortOrder: "asc" as const }, { id: "asc" as const }];
  const rows =
    model === "issue"
      ? await prisma.issueCategory.findMany({ where, orderBy })
      : await prisma.countermeasureCategory.findMany({ where, orderBy });
  return rows
    .filter((r) => r.parentId === null)
    .map((p) => ({
      id: Number(p.id),
      name: p.name,
      description: p.description,
      children: rows
        .filter((c) => c.parentId === p.id)
        .map((c) => ({ id: Number(c.id), name: c.name, description: c.description })),
    }));
}

export default async function ReportEditPage(props: {
  searchParams: Promise<{ copy?: string }>;
}) {
  // 役員も週報を提出する。使用する課題・対策マスタはロールで切り替える
  const user = await requireUser(["member", "manager", "executive"]);
  const scope = masterScopeFor(user.role);
  const { copy } = await props.searchParams;

  // 締切が翌週にずれている場合、締切日までは前週が対象になる
  const settings = await getDeadlineSettings();
  const weekStart = resolveTargetWeek(settings);

  const [skip, existing, issueCategories, cmCategories] = await Promise.all([
    prisma.skipWeek.findUnique({ where: { weekStartDate: weekStart } }),
    prisma.weeklyReport.findUnique({
      where: { userId_weekStartDate: { userId: user.id, weekStartDate: weekStart } },
      include: { issues: { orderBy: { sortOrder: "asc" }, include: { issueCategory: true, countermeasureCategory: true } }, compliance: true },
    }),
    loadCategories("issue", scope),
    loadCategories("cm", scope),
  ]);

  if (skip) {
    return (
      <>
        <h1 className="pg">週報入力<small>対象週: {weekRangeLabel(weekStart)}</small></h1>
        <div className="card">
          <p>この週は提出不要週です({skip.reason})。</p>
          <Link href="/" className="btn">ホームへ戻る</Link>
        </div>
      </>
    );
  }

  const pastDeadline =
    new Date() > deadlineAtOf(weekStart, settings.deadlineOffset, settings.deadlineTime);
  const locked = existing?.status === "locked";

  if (pastDeadline || locked) {
    return (
      <>
        <h1 className="pg">週報入力<small>対象週: {weekRangeLabel(weekStart)}</small></h1>
        <div className="card">
          <p>
            {locked
              ? "この週報はロックされています。修正が必要な場合は管理者に連絡してください。"
              : `提出締切(${deadlineDisplay(weekStart, settings)})を過ぎています。修正が必要な場合は管理者に連絡してください。`}
          </p>
          {existing && <Link href={`/reports/${existing.id}`} className="btn">提出内容を見る</Link>}
        </div>
      </>
    );
  }

  // 先週コピー
  let source = existing;
  if (!existing && copy === "1") {
    source = await prisma.weeklyReport.findUnique({
      where: { userId_weekStartDate: { userId: user.id, weekStartDate: addDays(weekStart, -7) } },
      include: { issues: { orderBy: { sortOrder: "asc" }, include: { issueCategory: true, countermeasureCategory: true } }, compliance: true },
    });
  }

  const issueParentOf = (subId: bigint | null | undefined, cats: CategoryOption[]) =>
    subId == null ? "" : cats.find((p) => p.children.some((c) => c.id === Number(subId)))?.id ?? "";

  const initial = {
    workSummary: source?.workSummary ?? "",
    selfRating: existing?.selfRating ?? "",
    issues: (source?.issues ?? []).map(
      (it): IssueRow => ({
        issueParentId: issueParentOf(it.issueCategoryId, issueCategories),
        issueCategoryId: Number(it.issueCategoryId),
        issueComment: it.issueComment ?? "",
        cmParentId: issueParentOf(it.countermeasureCategoryId, cmCategories),
        cmCategoryId: it.countermeasureCategoryId ? Number(it.countermeasureCategoryId) : "",
        cmComment: it.countermeasureComment ?? "",
      })
    ),
    complianceLevel: existing?.compliance?.level ?? "none",
    complianceContent: existing?.compliance?.content ?? "",
    complianceVisibility: existing?.compliance?.visibility ?? "manager_and_executive",
    isSubmitted: existing?.status === "submitted",
  };

  return (
    <>
      <h1 className="pg">
        週報入力<small>対象週: {weekRangeLabel(weekStart)}</small>
      </h1>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}
      >
        <span className="note">提出締切: {deadlineDisplay(weekStart, settings)}</span>
        {!existing && (
          <Link href="/reports/edit?copy=1" className="btn sm">
            先週の内容をコピー
          </Link>
        )}
      </div>
      <ReportForm issueCategories={issueCategories} cmCategories={cmCategories} initial={initial} />
    </>
  );
}
