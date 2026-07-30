import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getViewableTeams, getTeamMembers } from "@/lib/team-data";
import { currentWeekStart, weekLabel, addDays } from "@/lib/week";
import { sendManualReminder } from "./actions";

export default async function StatusPage() {
  const user = await requireUser(["manager", "executive"]);
  const teams = await getViewableTeams(user);
  if (teams.length === 0) redirect("/");

  const weekStart = currentWeekStart();
  const skip = await prisma.skipWeek.findUnique({ where: { weekStartDate: weekStart } });

  const rows = await Promise.all(
    teams.map(async (team) => {
      const members = await getTeamMembers(team.id);
      const submitted = await prisma.weeklyReport.findMany({
        where: { teamId: team.id, weekStartDate: weekStart, status: { not: "draft" } },
        select: { userId: true },
      });
      const submittedIds = new Set(submitted.map((r) => r.userId.toString()));
      const leaders = members.filter((m) => m.isLeader);
      const unsubmitted = members.filter((m) => !submittedIds.has(m.id.toString()));
      // 未確認週報数(自分が確認していない提出済週報)
      const unconfirmed = await prisma.weeklyReport.count({
        where: {
          teamId: team.id,
          weekStartDate: weekStart,
          status: { not: "draft" },
          userId: { not: user.id },
          confirmations: { none: { userId: user.id } },
        },
      });
      return { team, members, leaders, unsubmitted, submittedCount: members.length - unsubmitted.length, unconfirmed };
    })
  );

  const totalMembers = rows.reduce((a, r) => a + r.members.length, 0);
  const totalSubmitted = rows.reduce((a, r) => a + r.submittedCount, 0);
  const totalUnconfirmed = rows.reduce((a, r) => a + r.unconfirmed, 0);
  const deadline = addDays(weekStart, 4);

  return (
    <>
      <h1 className="pg">
        提出状況一覧<small>対象週: {weekLabel(weekStart)}</small>
      </h1>
      <div className="stack">
        {skip && (
          <div className="alert">
            <span className="ic">i</span>
            <span>今週は提出不要週です({skip.reason})。</span>
          </div>
        )}
        <div className="kpis">
          <div className="kpi">
            <div className="k">提出率</div>
            <div className="v num">
              {totalMembers ? Math.round((totalSubmitted / totalMembers) * 100) : 0}%
            </div>
            <div className="s note num">
              {totalSubmitted} / {totalMembers}名
            </div>
          </div>
          <div className="kpi">
            <div className="k">未提出</div>
            <div className="v num" style={{ color: totalMembers - totalSubmitted > 0 ? "var(--bad)" : undefined }}>
              {totalMembers - totalSubmitted}名
            </div>
            <div className="s note num">
              締切: {deadline.getUTCMonth() + 1}/{deadline.getUTCDate()}(金)
            </div>
          </div>
          <div className="kpi">
            <div className="k">確認待ち</div>
            <div className="v num" style={{ color: totalUnconfirmed > 0 ? "var(--warn)" : undefined }}>
              {totalUnconfirmed}件
            </div>
            <div className="s note">自分が未確認の週報</div>
          </div>
        </div>

        <div className="card">
          <div className="tscroll">
            <table>
              <thead>
                <tr><th>チーム</th><th>所属長</th><th className="num">提出</th><th>未提出者</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.team.id.toString()}>
                    <td><b>{r.team.name}</b></td>
                    <td>{r.leaders.map((l) => l.name).join("、") || "―"}</td>
                    <td className="num">
                      {r.submittedCount} / {r.members.length}
                    </td>
                    <td>
                      {r.unsubmitted.length === 0 ? (
                        <span className="note">―</span>
                      ) : (
                        r.unsubmitted.map((m) => m.name).join("、")
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {r.unsubmitted.length > 0 && !skip && (
                        <form action={sendManualReminder}>
                          <input type="hidden" name="teamId" value={r.team.id.toString()} />
                          <button className="btn sm">リマインド送信</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ margin: "10px 0 0" }}>
            「リマインド送信」は未提出者にTeamsで通知します(Webhook設定時のみ送信されます)。
          </p>
        </div>
      </div>
    </>
  );
}
