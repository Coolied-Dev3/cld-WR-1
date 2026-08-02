import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getViewableTeams, getTeamMembers } from "@/lib/team-data";
import { lastNWeekStarts, weekLabel, toDateKey } from "@/lib/week";
import { getAppSetting } from "@/lib/notify";
import { ratingMark, ratingClass } from "@/lib/labels";

export default async function TeamReportsPage(props: {
  searchParams: Promise<{ team?: string }>;
}) {
  const user = await requireUser(["manager", "executive"]);
  const { team: teamParam } = await props.searchParams;

  const teams = await getViewableTeams(user);
  if (teams.length === 0) redirect("/");
  const selected = teams.find((t) => t.id.toString() === teamParam) ?? teams[0];

  const weeks = lastNWeekStarts(8);
  const members = await getTeamMembers(selected.id);
  const reports = await prisma.weeklyReport.findMany({
    where: {
      teamId: selected.id,
      weekStartDate: { in: weeks },
      status: { not: "draft" },
      userId: { in: members.map((m) => m.id) },
    },
  });
  const alertWeeks = Number(await getAppSetting("alert_consecutive_low_weeks", "3"));

  const cell = (userId: bigint, week: Date) =>
    reports.find((r) => r.userId === userId && toDateKey(r.weekStartDate) === toDateKey(week));

  // 低評価連続アラート(最新週から連続で fair/poor が alertWeeks 週以上)
  const alerted = members.filter((m) => {
    let streak = 0;
    for (const w of weeks) {
      const r = cell(m.id, w);
      if (r && (r.selfRating === "fair" || r.selfRating === "poor")) streak++;
      else if (r) break;
      // 未提出週はスキップして継続判定
    }
    return streak >= alertWeeks;
  });

  return (
    <>
      <h1 className="pg">
        チーム管理<small>事業室のメンバー×週の提出状況</small>
      </h1>
      <div className="stack">
        <div className="card filterbar">
          <label>
            チーム
            <select
              name="team"
              defaultValue={selected.id.toString()}
              // 役員のみ切替可(フォームでGET遷移)
              disabled={teams.length <= 1}
              form="team-filter"
            >
              {teams.map((t) => (
                <option key={t.id.toString()} value={t.id.toString()}>{t.name}</option>
              ))}
            </select>
          </label>
          {teams.length > 1 && (
            <form id="team-filter" method="get">
              <button className="btn pri sm">表示</button>
            </form>
          )}
          <span style={{ flex: 1 }} />
          <span className="legend">
            <span><i className="m-ex">◎</i> 非常に良い</span>
            <span><i className="m-gd">○</i> 良い</span>
            <span><i className="m-fa">△</i> 課題あり</span>
            <span><i className="m-po">✕</i> 問題あり</span>
          </span>
        </div>

        {alerted.map((m) => (
          <div className="alert" key={m.id.toString()}>
            <span className="ic">⚠</span>
            <span>
              <b>{m.name}</b> さんは低評価(△・✕)が{alertWeeks}週以上連続しています。個別フォローを検討してください。
            </span>
          </div>
        ))}

        <div className="card">
          <div className="tscroll">
            <table>
              <thead>
                <tr>
                  <th>メンバー</th>
                  {weeks.map((w) => (
                    <th key={toDateKey(w)} className="num">{weekLabel(w)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id.toString()}>
                    <td>
                      <b>{m.name}</b>
                      {m.isLeader && <span className="pill mut" style={{ marginLeft: 6 }}>所属長</span>}
                      {alerted.includes(m) && <span className="pill warn" style={{ marginLeft: 6 }}>⚠</span>}
                    </td>
                    {weeks.map((w) => {
                      const r = cell(m.id, w);
                      return (
                        <td key={toDateKey(w)} style={{ whiteSpace: "nowrap" }}>
                          {r ? (
                            <Link href={`/reports/${r.id}`} className="cell-link">
                              <span className={`mark4 ${ratingClass[r.selfRating]}`}>
                                {ratingMark[r.selfRating]}
                              </span>
                              提出済
                            </Link>
                          ) : (
                            <span className="note">未提出</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ margin: "10px 0 0" }}>
            「提出済」をクリックすると週報の詳細が開き、コメントを登録できます。
            コメントを登録すると本人にTeamsで通知されます。
          </p>
        </div>
      </div>
    </>
  );
}
