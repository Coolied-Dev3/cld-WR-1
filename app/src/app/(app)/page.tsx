import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { weekRangeLabel, weekLabel, formatDateTime } from "@/lib/week";
import { getDeadlineSettings, resolveTargetWeek, deadlineDisplay } from "@/lib/deadline";
import { ratingMark, ratingClass, ratingScore, statusLabel } from "@/lib/labels";

export default async function HomePage() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin/users");
  // 役員は週報を提出しないため、確認する側の画面(提出状況)を入口にする
  if (user.role === "executive") redirect("/team/status");

  // 締切が翌週にずれている場合、締切日までは前週が「提出すべき週」になる
  const settings = await getDeadlineSettings();
  const weekStart = resolveTargetWeek(settings);
  const [myThisWeek, skip, myReports, recentComments] = await Promise.all([
    prisma.weeklyReport.findUnique({
      where: { userId_weekStartDate: { userId: user.id, weekStartDate: weekStart } },
    }),
    prisma.skipWeek.findUnique({ where: { weekStartDate: weekStart } }),
    prisma.weeklyReport.findMany({
      where: { userId: user.id, status: { not: "draft" } },
      orderBy: { weekStartDate: "desc" },
      take: 12,
      include: { _count: { select: { comments: true } } },
    }),
    prisma.comment.findMany({
      where: { report: { userId: user.id }, userId: { not: user.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: true, report: true },
    }),
  ]);

  const trend = [...myReports].reverse();

  return (
    <>
      <h1 className="pg">
        ホーム<small>対象週: {weekRangeLabel(weekStart)}</small>
      </h1>
      <div className="stack">
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, color: "var(--ink2)" }}>提出する週報</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
              {skip ? (
                <span className="pill mut">提出不要週({skip.reason})</span>
              ) : myThisWeek?.status === "submitted" || myThisWeek?.status === "locked" ? (
                <span className="pill ok">提出済</span>
              ) : myThisWeek?.status === "draft" ? (
                <span className="pill warn">下書き</span>
              ) : (
                <span className="pill bad">未提出</span>
              )}
              {!skip && (
                <span className="note" style={{ marginLeft: 10 }}>
                  締切: {deadlineDisplay(weekStart, settings)}
                </span>
              )}
            </div>
          </div>
          {!skip && (
            <Link href="/reports/edit" className="btn pri">
              {myThisWeek ? "週報を編集する" : "週報を書く"}
            </Link>
          )}
        </div>

        {recentComments.length > 0 && (
          <div className="card">
            <h2>最近のコメント</h2>
            <table>
              <tbody>
                {recentComments.map((c) => (
                  <tr key={c.id.toString()}>
                    <td>
                      {weekLabel(c.report.weekStartDate)}の週報に <b>{c.user.name}</b> さんからコメント
                      <span className="note" style={{ marginLeft: 8 }}>{formatDateTime(c.createdAt)}</span>
                    </td>
                    <td style={{ width: 70, textAlign: "right" }}>
                      <Link href={`/reports/${c.reportId}`} className="btn sm">開く</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="hrow">
          <div className="card" style={{ flex: 1.6 }}>
            <h2>自分の週報(時系列)</h2>
            <div className="tscroll">
              <table>
                <thead>
                  <tr><th>対象週</th><th>評価</th><th>状態</th><th>コメント</th><th></th></tr>
                </thead>
                <tbody>
                  {myReports.length === 0 && (
                    <tr><td colSpan={5} className="note">まだ週報がありません。</td></tr>
                  )}
                  {myReports.map((r) => (
                    <tr key={r.id.toString()}>
                      <td className="num">{weekLabel(r.weekStartDate)}</td>
                      <td className={`mark4 ${ratingClass[r.selfRating]}`}>{ratingMark[r.selfRating]}</td>
                      <td><span className="pill ok">{statusLabel[r.status]}</span></td>
                      <td className="num">{r._count.comments}件</td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/reports/${r.id}`} className="btn sm">詳細</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>評価推移(直近{trend.length}週)</h2>
            {trend.length === 0 ? (
              <p className="note">データがありません。</p>
            ) : (
              <div className="chart-wrap">
                <svg viewBox="0 0 300 130" width="100%" role="img" aria-label="評価推移の折れ線グラフ">
                  {[15, 45, 75, 105].map((y) => (
                    <line key={y} x1="30" y1={y} x2="290" y2={y} stroke="var(--line)" />
                  ))}
                  {["◎", "○", "△", "✕"].map((m, i) => (
                    <text key={m} x="24" y={19 + i * 30} fontSize="10" fill="var(--ink3)" textAnchor="end">{m}</text>
                  ))}
                  <polyline
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    points={trend
                      .map((r, i) => {
                        const x = trend.length === 1 ? 160 : 40 + (i * 250) / (trend.length - 1);
                        const y = 15 + (4 - ratingScore[r.selfRating]) * 30;
                        return `${x},${y}`;
                      })
                      .join(" ")}
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
