import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getViewableTeams } from "@/lib/team-data";
import { computeStats } from "@/lib/stats";
import { weekLabel, toDateKey } from "@/lib/week";

const RATINGS = [
  { key: "excellent", mark: "◎", color: "var(--good)" },
  { key: "good", mark: "○", color: "var(--ok)" },
  { key: "fair", mark: "△", color: "var(--warn)" },
  { key: "poor", mark: "✕", color: "var(--bad)" },
] as const;

export default async function DashboardPage(props: {
  searchParams: Promise<{ team?: string; weeks?: string }>;
}) {
  const user = await requireUser(["manager", "executive"]);
  const { team: teamParam, weeks: weeksParam } = await props.searchParams;

  const teams = await getViewableTeams(user);
  if (teams.length === 0) redirect("/");
  const isExec = user.role === "executive";

  const isAll = isExec && (teamParam === "all" || !teamParam);
  const selected = isAll ? null : teams.find((t) => t.id.toString() === teamParam) ?? teams[0];
  const numWeeks = weeksParam === "26" ? 26 : 12;

  const stats = await computeStats(selected ? [selected.id] : [], numWeeks);

  // 役員の全社ビュー: チーム別比較
  const teamRows = isAll
    ? await Promise.all(
        teams.map(async (t) => ({ team: t, s: await computeStats([t.id], numWeeks) }))
      )
    : [];

  const maxIssue = Math.max(1, ...stats.issueCounts.map((c) => c.count));
  const distTotal = Math.max(1, stats.reportCount);
  const trendPoints = stats.weeklyAvg.filter((w) => w.avg !== null);

  return (
    <>
      <h1 className="pg">
        {isAll ? "全社ダッシュボード" : "チームダッシュボード"}
        <small>
          {selected?.name ?? "全チーム"} · 直近{numWeeks}週
        </small>
      </h1>
      <div className="stack">
        <form className="card filterbar" method="get">
          <label>
            対象
            <select name="team" defaultValue={isAll ? "all" : selected!.id.toString()}>
              {isExec && <option value="all">全社</option>}
              {teams.map((t) => (
                <option key={t.id.toString()} value={t.id.toString()}>{t.name}</option>
              ))}
            </select>
          </label>
          <label>
            期間
            <select name="weeks" defaultValue={String(numWeeks)}>
              <option value="12">直近12週</option>
              <option value="26">直近26週</option>
            </select>
          </label>
          <button className="btn pri sm">表示</button>
          <span style={{ flex: 1 }} />
          {isExec && (
            <a
              className="btn sm"
              href={`/team/dashboard/export?team=${isAll ? "all" : selected!.id}&weeks=${numWeeks}`}
            >
              CSVエクスポート
            </a>
          )}
        </form>

        <div className="kpis">
          <div className="kpi">
            <div className="k">平均評価</div>
            <div className="v num">
              {stats.avgScore !== null ? stats.avgScore.toFixed(1) : "―"}
              <span style={{ fontSize: 13, color: "var(--ink3)" }}> / 4.0</span>
            </div>
          </div>
          <div className="kpi">
            <div className="k">提出率</div>
            <div className="v num">
              {stats.submissionRate !== null ? Math.round(stats.submissionRate * 100) + "%" : "―"}
            </div>
            <div className="s note num">対象 {stats.memberCount}名</div>
          </div>
          <div className="kpi">
            <div className="k">課題件数</div>
            <div className="v num">{stats.issueCounts.reduce((a, c) => a + c.count, 0)}件</div>
          </div>
          <div className="kpi">
            <div className="k">モラル報告</div>
            <div className="v num">{stats.complianceCount}件</div>
            <div className="s note">件数のみ表示</div>
          </div>
        </div>

        <div className="hrow">
          <div className="card">
            <h2>評価分布</h2>
            {stats.reportCount === 0 ? (
              <p className="note">データがありません。</p>
            ) : (
              <div className="chart-wrap">
                <svg viewBox="0 0 300 145" width="100%" role="img" aria-label="評価分布の棒グラフ">
                  {RATINGS.map((r, i) => {
                    const count = stats.distribution[r.key];
                    const h = Math.round((count / distTotal) * 100);
                    return (
                      <g key={r.key}>
                        <rect x={35 + i * 70} y={120 - h} width="44" height={Math.max(h, 1)} rx="3" fill={r.color} />
                        <text x={57 + i * 70} y="138" fontSize="12" fill="var(--ink2)" textAnchor="middle">
                          {r.mark} {count}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
          <div className="card">
            <h2>評価推移(平均)</h2>
            {trendPoints.length === 0 ? (
              <p className="note">データがありません。</p>
            ) : (
              <div className="chart-wrap">
                <svg viewBox="0 0 320 145" width="100%" role="img" aria-label="平均評価の推移">
                  {[20, 60, 100].map((y) => (
                    <line key={y} x1="25" y1={y} x2="310" y2={y} stroke="var(--line)" />
                  ))}
                  <text x="20" y="24" fontSize="9" fill="var(--ink3)" textAnchor="end">4.0</text>
                  <text x="20" y="104" fontSize="9" fill="var(--ink3)" textAnchor="end">2.0</text>
                  <polyline
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2.5"
                    points={stats.weeklyAvg
                      .map((w, i) => {
                        if (w.avg === null) return null;
                        const x = 30 + (i * 275) / Math.max(1, stats.weeklyAvg.length - 1);
                        const y = 20 + (4 - w.avg) * 40;
                        return `${x},${y}`;
                      })
                      .filter(Boolean)
                      .join(" ")}
                  />
                  <text x="30" y="140" fontSize="10" fill="var(--ink3)">{weekLabel(stats.weeks[0])}</text>
                  <text x="280" y="140" fontSize="10" fill="var(--ink3)" textAnchor="end">
                    {weekLabel(stats.weeks[stats.weeks.length - 1])}
                  </text>
                </svg>
              </div>
            )}
          </div>
        </div>

        <div className="hrow">
          <div className="card">
            <h2>課題カテゴリ 出現頻度(大分類)</h2>
            {stats.issueCounts.length === 0 ? (
              <p className="note">データがありません。</p>
            ) : (
              <table>
                <tbody>
                  {stats.issueCounts.slice(0, 8).map((c) => (
                    <tr key={c.name}>
                      <td style={{ width: 130 }}>{c.name}</td>
                      <td>
                        <div
                          style={{
                            background: "var(--accent)",
                            opacity: 0.5 + 0.5 * (c.count / maxIssue),
                            height: 16,
                            borderRadius: 3,
                            width: `${Math.round((c.count / maxIssue) * 100)}%`,
                            minWidth: 4,
                          }}
                        />
                      </td>
                      <td className="num" style={{ width: 60 }}>{c.count}件</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h2>対策カテゴリ 出現頻度(大分類)</h2>
            {stats.cmCounts.length === 0 ? (
              <p className="note">データがありません。</p>
            ) : (
              <table>
                <tbody>
                  {stats.cmCounts.slice(0, 8).map((c) => (
                    <tr key={c.name}>
                      <td style={{ width: 150 }}>{c.name}</td>
                      <td className="num" style={{ width: 60 }}>{c.count}件</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {isAll && (
          <div className="card">
            <h2>チーム別比較</h2>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th>チーム</th><th className="num">人数</th><th className="num">平均評価</th>
                    <th className="num">提出率</th><th className="num">課題件数</th><th className="num">モラル報告</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows.map(({ team, s }) => (
                    <tr key={team.id.toString()}>
                      <td><b>{team.name}</b></td>
                      <td className="num">{s.memberCount}名</td>
                      <td className="num">{s.avgScore !== null ? s.avgScore.toFixed(1) : "―"}</td>
                      <td className="num">
                        {s.submissionRate !== null ? Math.round(s.submissionRate * 100) + "%" : "―"}
                      </td>
                      <td className="num">{s.issueCounts.reduce((a, c) => a + c.count, 0)}件</td>
                      <td className="num">{s.complianceCount}件</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
