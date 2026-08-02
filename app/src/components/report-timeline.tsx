import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { monthRange, monthLabel, weekRangeLabel, formatDateTime, toMonthKey } from "@/lib/week";
import { ratingMark, ratingClass, ratingLabel, statusLabel, complianceLevelLabel } from "@/lib/labels";

/**
 * プルダウンに出す年月と、初期表示する年月を返す。
 *
 * - 選択肢: 週報が存在する月 + 当月(新しい順)
 * - 初期表示: 当月。ただし当月にまだ週報がなければ、週報がある直近の月
 *   (開いてすぐ内容が見えるようにするため)
 * - URLで月が指定されていればそれを優先する
 */
export async function resolveMonths(
  userId: bigint,
  requested: string | undefined,
  currentKey: string
): Promise<{ months: string[]; selected: string }> {
  const reports = await prisma.weeklyReport.findMany({
    where: { userId, status: { not: "draft" } },
    select: { weekStartDate: true },
    orderBy: { weekStartDate: "desc" },
  });
  const withReports = [...new Set(reports.map((r) => toMonthKey(r.weekStartDate)))]
    .sort()
    .reverse();
  const months = [...new Set([currentKey, ...withReports])].sort().reverse();

  const valid = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : null;
  const selected =
    valid ?? (withReports.includes(currentKey) ? currentKey : withReports[0] ?? currentKey);

  return { months, selected };
}

/** 指定ユーザー・指定月の週報を新しい順で取得 */
export async function getMonthlyReports(userId: bigint, monthKey: string) {
  const { start, end } = monthRange(monthKey);
  return prisma.weeklyReport.findMany({
    where: {
      userId,
      status: { not: "draft" },
      weekStartDate: { gte: start, lt: end },
    },
    orderBy: { weekStartDate: "desc" }, // 最新が上、最古が下
    include: {
      issues: {
        orderBy: { sortOrder: "asc" },
        include: {
          issueCategory: { include: { parent: true } },
          countermeasureCategory: { include: { parent: true } },
        },
      },
      compliance: true,
      _count: { select: { comments: true } },
    },
  });
}

export type MonthlyReport = Awaited<ReturnType<typeof getMonthlyReports>>[number];

/** 年月プルダウン(GETで再読み込み)。extra には保持したい他のクエリを渡す */
export function MonthPicker({
  action,
  months,
  selected,
  extra,
}: {
  action: string;
  months: string[];
  selected: string;
  extra?: Record<string, string>;
}) {
  return (
    <form method="get" action={action} className="filterbar">
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label>
        表示月
        <select name="month" defaultValue={selected}>
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
      </label>
      <button className="btn pri sm">表示</button>
    </form>
  );
}

const catLabel = (c: { name: string; parent: { name: string } | null } | null) =>
  c ? `${c.parent ? c.parent.name + " / " : ""}${c.name}` : "―";

/** 閲覧者の立場。モラル・ハラスメント欄の表示可否の判定に使う */
export type TimelineViewer = "owner" | "manager" | "executive";

/** その週報のモラル欄を閲覧できるか(本人・役員は常に可、所属長は公開範囲による) */
function canSeeCompliance(viewer: TimelineViewer, visibility?: string | null): boolean {
  if (viewer === "owner" || viewer === "executive") return true;
  return visibility !== "executive_only";
}

/**
 * 週報の一覧表示。新しい週が上、古い週が下に並ぶ。
 * モラル・ハラスメント欄は閲覧者の立場と各報告の公開範囲に応じて出し分ける。
 */
export function ReportTimeline({
  reports,
  monthKey,
  viewer,
  emptyMessage = "この月の週報はありません。",
}: {
  reports: MonthlyReport[];
  monthKey: string;
  viewer: TimelineViewer;
  emptyMessage?: string;
}) {
  if (reports.length === 0) {
    return (
      <div className="card">
        <p className="note" style={{ margin: 0 }}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="note" style={{ margin: 0 }}>
        {monthLabel(monthKey)}の週報 {reports.length}件(新しい週が上、古い週が下)
      </p>
      {reports.map((r) => (
        <article className="card report-entry" key={r.id.toString()}>
          <header className="report-entry-hd">
            <span className="wk num">{weekRangeLabel(r.weekStartDate)}</span>
            <span className={`mark4 ${ratingClass[r.selfRating]}`} title={ratingLabel[r.selfRating]}>
              {ratingMark[r.selfRating]} {ratingLabel[r.selfRating]}
            </span>
            <span className="pill ok">{statusLabel[r.status]}</span>
            <span style={{ flex: 1 }} />
            <span className="note num">
              {r.submittedAt ? `提出 ${formatDateTime(r.submittedAt)}` : ""}
            </span>
            <Link href={`/reports/${r.id}`} className="btn sm">
              詳細{r._count.comments > 0 ? `・コメント${r._count.comments}件` : ""}
            </Link>
          </header>

          <h3 className="report-entry-h">今週行ったこと</h3>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.workSummary || "(未記入)"}</p>

          <h3 className="report-entry-h">課題と対策</h3>
          {r.issues.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>登録なし</p>
          ) : (
            <div className="tscroll">
              <table>
                <thead>
                  <tr><th>課題</th><th>課題詳細</th><th>対策</th><th>対策詳細</th></tr>
                </thead>
                <tbody>
                  {r.issues.map((it) => (
                    <tr key={it.id.toString()}>
                      <td><span className="pill mut">{catLabel(it.issueCategory)}</span></td>
                      <td>{it.issueComment ?? "―"}</td>
                      <td>
                        {it.countermeasureCategory ? (
                          <span className="pill mut">{catLabel(it.countermeasureCategory)}</span>
                        ) : (
                          <span className="note">未定</span>
                        )}
                      </td>
                      <td>{it.countermeasureComment ?? "―"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {r.compliance && canSeeCompliance(viewer, r.compliance.visibility) && (
            <>
              <h3 className="report-entry-h">ビジネスモラル・ハラスメント</h3>
              <p style={{ margin: 0 }}>
                <span
                  className={`pill ${
                    r.compliance.level === "none" ? "mut" : r.compliance.level === "concern" ? "warn" : "bad"
                  }`}
                >
                  {complianceLevelLabel[r.compliance.level]}
                </span>
                {r.compliance.level !== "none" && (
                  <span className="note" style={{ marginLeft: 8 }}>
                    内容は詳細画面で確認できます(閲覧は記録されます)
                  </span>
                )}
              </p>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
