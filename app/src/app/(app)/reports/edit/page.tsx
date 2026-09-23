import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { weekRangeLabel, addDays, toDateKey } from "@/lib/week";
import { getDeadlineSettings, resolveEditableWeek, deadlineAtOf, deadlineDisplay } from "@/lib/deadline";
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
  searchParams: Promise<{ copy?: string; week?: string }>;
}) {
  // 役員も週報を提出する。使用する課題・対策マスタはロールで切り替える
  const user = await requireUser(["member", "manager", "executive"]);
  const scope = masterScopeFor(user.role);
  const { copy, week } = await props.searchParams;

  // 通常は「いま提出すべき週」。締切後に書きたいケースのため前週にも切り替えられる
  const settings = await getDeadlineSettings();
  const { weekStart, prevWeek, isPrev } = resolveEditableWeek(settings, week);
  const weekKey = toDateKey(weekStart);

  // 前週は「まだ提出していない人」だけが書ける(提出済みなら切替ボタンも出さない)
  const prevReport = await prisma.weeklyReport.findUnique({
    where: { userId_weekStartDate: { userId: user.id, weekStartDate: prevWeek } },
    select: { id: true, status: true },
  });
  const prevSubmitted = prevReport !== null && prevReport.status !== "draft";
  const canSwitch = isPrev || !prevSubmitted;
  const switchHref = isPrev ? "/reports/edit" : `/reports/edit?week=${toDateKey(prevWeek)}`;
  const switchLabel = isPrev ? "今週の週報に戻る" : "前週の週報を書く";

  if (isPrev && prevSubmitted) {
    return (
      <>
        <h1 className="pg">週報入力<small>対象週: {weekRangeLabel(weekStart)}</small></h1>
        <div className="card">
          <p>前週分の週報はすでに提出済みです。修正が必要な場合は管理者に連絡してください。</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/reports/${prevReport!.id}`} className="btn">提出内容を見る</Link>
            <Link href="/reports/edit" className="btn">今週の週報に戻る</Link>
          </div>
        </div>
      </>
    );
  }

  const heading = (
    <h1 className="pg">
      週報入力
      <small>
        対象週: {weekRangeLabel(weekStart)}
        {isPrev && <span className="pill warn" style={{ marginLeft: 8 }}>前週分</span>}
      </small>
    </h1>
  );

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
        {heading}
        <div className="card">
          <p>この週は提出不要週です({skip.reason})。</p>
          <div style={{ display: "flex", gap: 8 }}>
            {canSwitch && <Link href={switchHref} className="btn">{switchLabel}</Link>}
            <Link href="/" className="btn">ホームへ戻る</Link>
          </div>
        </div>
      </>
    );
  }

  if (existing?.status === "locked") {
    return (
      <>
        {heading}
        <div className="card">
          <p>この週報はロックされています。修正が必要な場合は管理者に連絡してください。</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/reports/${existing.id}`} className="btn">提出内容を見る</Link>
            {canSwitch && <Link href={switchHref} className="btn">{switchLabel}</Link>}
          </div>
        </div>
      </>
    );
  }

  // 締切を過ぎていても保存・提出はできる(提出日時が記録されるので遅れは一覧で分かる)
  const pastDeadline =
    new Date() > deadlineAtOf(weekStart, settings.deadlineOffset, settings.deadlineTime);

  // 先週コピー(対象週の1つ前の週の内容)
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
    freeComment: existing?.freeComment ?? "",
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

  const copyHref = isPrev ? `/reports/edit?week=${weekKey}&copy=1` : "/reports/edit?copy=1";

  return (
    <>
      {heading}
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}
      >
        <span className="note">
          提出締切: {deadlineDisplay(weekStart, settings)}
          {pastDeadline && (
            <span style={{ color: "var(--warn)", marginLeft: 8 }}>
              締切を過ぎています(提出はできます。提出日時が記録されます)
            </span>
          )}
        </span>
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canSwitch && <Link href={switchHref} className="btn sm">{switchLabel}</Link>}
          {!existing && (
            <Link href={copyHref} className="btn sm">
              先週の内容をコピー
            </Link>
          )}
        </span>
      </div>
      <ReportForm issueCategories={issueCategories} cmCategories={cmCategories} initial={initial} weekKey={weekKey} />
    </>
  );
}
