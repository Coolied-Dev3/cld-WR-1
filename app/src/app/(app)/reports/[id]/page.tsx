import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canViewReport } from "@/lib/auth";
import { weekLabel, formatDateTime } from "@/lib/week";
import { ratingMark, ratingClass, statusLabel, complianceLevelLabel } from "@/lib/labels";
import { addComment, confirmReport } from "./actions";

export default async function ReportDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin/users");
  const { id } = await props.params;

  let reportId: bigint;
  try {
    reportId = BigInt(id);
  } catch {
    notFound();
  }

  const report = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    include: {
      user: true,
      team: true,
      issues: {
        orderBy: { sortOrder: "asc" },
        include: {
          issueCategory: { include: { parent: true } },
          countermeasureCategory: { include: { parent: true } },
        },
      },
      compliance: true,
      comments: { orderBy: { createdAt: "asc" }, include: { user: true } },
      confirmations: { include: { user: true } },
    },
  });
  if (!report || !canViewReport(user, report)) notFound();

  const isOwner = report.userId === user.id;
  const isReviewer = !isOwner && (user.role === "manager" || user.role === "executive");

  // モラル欄の閲覧可否
  const compliance = report.compliance;
  const canSeeCompliance =
    isOwner ||
    user.role === "executive" ||
    (user.role === "manager" && compliance?.visibility !== "executive_only");

  // 役員・所属長がレベルあり報告を閲覧したらログ記録
  if (compliance && canSeeCompliance && !isOwner && compliance.level !== "none") {
    await prisma.complianceViewLog.create({
      data: { complianceReportId: compliance.id, viewedBy: user.id },
    });
  }

  // 前後の週報(同一ユーザー)
  const [prev, next] = await Promise.all([
    prisma.weeklyReport.findFirst({
      where: { userId: report.userId, weekStartDate: { lt: report.weekStartDate }, status: { not: "draft" } },
      orderBy: { weekStartDate: "desc" },
    }),
    prisma.weeklyReport.findFirst({
      where: { userId: report.userId, weekStartDate: { gt: report.weekStartDate }, status: { not: "draft" } },
      orderBy: { weekStartDate: "asc" },
    }),
  ]);

  const myConfirmation = report.confirmations.find((c) => c.userId === user.id);
  const topComments = report.comments.filter((c) => !c.parentCommentId);
  const repliesOf = (cid: bigint) => report.comments.filter((c) => c.parentCommentId === cid);

  const catLabel = (c: { name: string; parent: { name: string } | null } | null) =>
    c ? `${c.parent ? c.parent.name + "/" : ""}${c.name}` : "―";

  return (
    <>
      <div className="crumb">
        {isOwner ? "自分の週報" : `${report.team.name}の週報`} › {report.user.name} › {weekLabel(report.weekStartDate)}
      </div>
      <h1 className="pg">
        {report.user.name}({report.team.name}){weekLabel(report.weekStartDate)}の週報
      </h1>
      <div className="stack">
        <div className="card" style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <span>
            評価:{" "}
            <span className={`mark4 ${ratingClass[report.selfRating]}`} style={{ fontSize: 18 }}>
              {ratingMark[report.selfRating]}
            </span>
          </span>
          <span className="note num">
            {report.submittedAt ? `提出: ${formatDateTime(report.submittedAt)}` : statusLabel[report.status]}
          </span>
          {report.confirmations.map((c) => (
            <span key={c.id.toString()} className="pill ok">
              確認済({c.user.name})
            </span>
          ))}
          <span style={{ flex: 1 }} />
          {isReviewer && !myConfirmation && (
            <form action={confirmReport}>
              <input type="hidden" name="reportId" value={report.id.toString()} />
              <button className="btn sm">確認済みにする</button>
            </form>
          )}
          <span className="note num">
            {prev ? <Link href={`/reports/${prev.id}`}>‹ 前の週</Link> : <span>‹ 前の週</span>}
            {" | "}
            {next ? <Link href={`/reports/${next.id}`}>次の週 ›</Link> : <span>次の週 ›</span>}
          </span>
        </div>

        <div className="card">
          <h2>今週行ったこと</h2>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{report.workSummary || "(未記入)"}</p>
        </div>

        <div className="card">
          <h2>課題と対策</h2>
          {report.issues.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>登録なし</p>
          ) : (
            <div className="tscroll">
              <table>
                <thead>
                  <tr><th>課題</th><th>課題詳細</th><th>対策</th><th>対策詳細</th></tr>
                </thead>
                <tbody>
                  {report.issues.map((it) => (
                    <tr key={it.id.toString()}>
                      <td>
                        <span className="pill mut">{catLabel(it.issueCategory)}</span>
                        {it.issueCategory.description && (
                          <div className="note" style={{ marginTop: 3 }}>{it.issueCategory.description}</div>
                        )}
                      </td>
                      <td>{it.issueComment ?? "―"}</td>
                      <td>
                        {it.countermeasureCategory ? (
                          <>
                            <span className="pill mut">{catLabel(it.countermeasureCategory)}</span>
                            {it.countermeasureCategory.description && (
                              <div className="note" style={{ marginTop: 3 }}>
                                {it.countermeasureCategory.description}
                              </div>
                            )}
                          </>
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
        </div>

        {canSeeCompliance && compliance && (
          <div className="card">
            <h2>ビジネスモラル・ハラスメント</h2>
            <p style={{ margin: 0 }}>
              <span className={`pill ${compliance.level === "none" ? "mut" : compliance.level === "concern" ? "warn" : "bad"}`}>
                {complianceLevelLabel[compliance.level]}
              </span>
              {compliance.level !== "none" && compliance.visibility === "executive_only" && (
                <span className="pill mut" style={{ marginLeft: 8 }}>役員のみ公開</span>
              )}
            </p>
            {compliance.level !== "none" && compliance.content && (
              <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{compliance.content}</p>
            )}
            {!isOwner && compliance.level !== "none" && (
              <p className="note" style={{ marginBottom: 0 }}>※ この欄の閲覧は記録されます。</p>
            )}
          </div>
        )}

        <div className="card">
          <h2>コメント</h2>
          {topComments.length === 0 && <p className="note">コメントはまだありません。</p>}
          {topComments.map((c) => (
            <div key={c.id.toString()}>
              <div className="cmt">
                <div className="av">{c.user.name.charAt(0)}</div>
                <div className="bd">
                  <div className="meta">
                    {c.user.name} · {formatDateTime(c.createdAt)}
                  </div>
                  <span style={{ whiteSpace: "pre-wrap" }}>{c.content}</span>
                </div>
              </div>
              {repliesOf(c.id).map((r) => (
                <div className="cmt reply" key={r.id.toString()}>
                  <div className="av">{r.user.name.charAt(0)}</div>
                  <div className="bd">
                    <div className="meta">
                      {r.user.name} · {formatDateTime(r.createdAt)}
                    </div>
                    <span style={{ whiteSpace: "pre-wrap" }}>{r.content}</span>
                  </div>
                </div>
              ))}
              {/* 本人には返信欄を常時表示。それ以外は折りたたみ */}
              {isOwner ? (
                <form
                  action={addComment}
                  className="cmt reply"
                  style={{ display: "flex", gap: 8, marginBottom: 16 }}
                >
                  <input type="hidden" name="reportId" value={report.id.toString()} />
                  <input type="hidden" name="parentCommentId" value={c.id.toString()} />
                  <input type="text" name="content" placeholder={`${c.user.name} さんに返信を書く…`} required />
                  <button className="btn sm pri" style={{ whiteSpace: "nowrap" }}>返信する</button>
                </form>
              ) : (
                <details className="cmt reply" style={{ marginBottom: 14 }}>
                  <summary className="note" style={{ cursor: "pointer" }}>返信する</summary>
                  <form action={addComment} style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <input type="hidden" name="reportId" value={report.id.toString()} />
                    <input type="hidden" name="parentCommentId" value={c.id.toString()} />
                    <input type="text" name="content" placeholder="返信を書く…" required />
                    <button className="btn sm pri" style={{ whiteSpace: "nowrap" }}>送信</button>
                  </form>
                </details>
              )}
            </div>
          ))}
          {isReviewer && (
            <>
              <form action={addComment} style={{ display: "flex", gap: 8 }}>
                <input type="hidden" name="reportId" value={report.id.toString()} />
                <input type="text" name="content" placeholder="コメントを書く…" required />
                <button className="btn pri" style={{ whiteSpace: "nowrap" }}>送信</button>
              </form>
              <p className="note" style={{ margin: "8px 0 0" }}>
                コメントを送信すると {report.user.name} さんにTeamsで通知されます。
              </p>
            </>
          )}
          {isOwner && topComments.length === 0 && (
            <p className="note" style={{ marginBottom: 0 }}>
              所属長・役員からコメントが届くと、ここに表示され返信できるようになります。
            </p>
          )}
        </div>
      </div>
    </>
  );
}
