import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { currentWeekStart, weekRangeLabel, addDays, jstToday } from "@/lib/week";
import { getAppSetting } from "@/lib/notify";
import { ReportForm } from "./report-form";
import type { CategoryOption, IssueRow } from "./issues-editor";

async function loadCategories(model: "issue" | "cm"): Promise<CategoryOption[]> {
  const rows =
    model === "issue"
      ? await prisma.issueCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })
      : await prisma.countermeasureCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return rows
    .filter((r) => r.parentId === null)
    .map((p) => ({
      id: Number(p.id),
      name: p.name,
      children: rows
        .filter((c) => c.parentId === p.id)
        .map((c) => ({ id: Number(c.id), name: c.name })),
    }));
}

export default async function ReportEditPage(props: {
  searchParams: Promise<{ copy?: string }>;
}) {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin/users");
  const { copy } = await props.searchParams;

  const weekStart = currentWeekStart();
  const [skip, existing, issueCategories, cmCategories, deadlineTime] = await Promise.all([
    prisma.skipWeek.findUnique({ where: { weekStartDate: weekStart } }),
    prisma.weeklyReport.findUnique({
      where: { userId_weekStartDate: { userId: user.id, weekStartDate: weekStart } },
      include: { issues: { orderBy: { sortOrder: "asc" }, include: { issueCategory: true, countermeasureCategory: true } }, compliance: true },
    }),
    loadCategories("issue"),
    loadCategories("cm"),
    getAppSetting("deadline_time", "18:00"),
  ]);

  if (skip) {
    return (
      <>
        <h1 className="pg">週報入力<small>対象週: {weekRangeLabel(weekStart)}</small></h1>
        <div className="card">
          <p>今週は提出不要週です({skip.reason})。</p>
          <Link href="/" className="btn">ホームへ戻る</Link>
        </div>
      </>
    );
  }

  // 締切チェック(金曜 deadline_time JST)
  const [dh, dm] = deadlineTime.split(":").map(Number);
  const deadline = new Date(addDays(weekStart, 4).getTime() + ((dh - 9) * 60 + dm) * 60 * 1000); // JST→UTC
  const pastDeadline = new Date() > deadline;
  const locked = existing?.status === "locked";

  if (pastDeadline || locked) {
    return (
      <>
        <h1 className="pg">週報入力<small>対象週: {weekRangeLabel(weekStart)}</small></h1>
        <div className="card">
          <p>
            {locked
              ? "この週報はロックされています。修正が必要な場合は管理者に連絡してください。"
              : `提出締切(金曜 ${deadlineTime})を過ぎています。修正が必要な場合は管理者に連絡してください。`}
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
      {!existing && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Link href="/reports/edit?copy=1" className="btn sm">
            先週の内容をコピー
          </Link>
        </div>
      )}
      <ReportForm issueCategories={issueCategories} cmCategories={cmCategories} initial={initial} />
    </>
  );
}
