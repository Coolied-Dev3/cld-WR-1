import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { toDateKey, jstToday } from "@/lib/week";
import { MAX_TEAMS_PER_USER } from "@/lib/team-data";
import { createTeam, assignMembership, endMembership } from "../actions";

export default async function AdminTeamsPage() {
  await requireUser(["admin"]);
  const [teams, users] = await Promise.all([
    prisma.team.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      include: {
        memberships: {
          where: { endDate: null, user: { isActive: true } },
          include: { user: true },
          orderBy: [{ isLeader: "desc" }, { userId: "asc" }],
        },
      },
    }),
    prisma.user.findMany({ where: { isActive: true, role: { not: "admin" } }, orderBy: { id: "asc" } }),
  ]);

  return (
    <>
      <h1 className="pg">チーム管理</h1>
      <div className="stack">
        <div className="hrow">
          <div className="card">
            <h2>チーム作成</h2>
            <form action={createTeam} style={{ display: "flex", gap: 8 }}>
              <input type="text" name="name" placeholder="チーム名" required />
              <button className="btn pri" style={{ whiteSpace: "nowrap" }}>作成</button>
            </form>
          </div>
          <div className="card" style={{ flex: 2 }}>
            <h2>所属追加</h2>
            <form action={assignMembership} className="filterbar">
              <label>
                ユーザー
                <select name="userId" required>
                  {users.map((u) => (
                    <option key={u.id.toString()} value={u.id.toString()}>{u.name}</option>
                  ))}
                </select>
              </label>
              <label>
                事業室
                <select name="teamId" required>
                  {teams.map((t) => (
                    <option key={t.id.toString()} value={t.id.toString()}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label>
                開始日
                <input type="date" name="startDate" defaultValue={toDateKey(jstToday())} required style={{ width: "auto" }} />
              </label>
              <label>
                <input type="checkbox" name="isLeader" /> 所属長にする
              </label>
              <button className="btn pri sm">追加</button>
            </form>
            <p className="note" style={{ marginBottom: 0 }}>
              1人は最大{MAX_TEAMS_PER_USER}つの事業室に所属できます(上限に達している場合は追加されません)。
              既存の所属はそのまま残るので、異動の場合は下の一覧で元の所属を「解除」してください。
              解除した所属は終了日付きで履歴に残り、過去の週報は当時の事業室の統計に残ります。
              1つの事業室に所属長を複数置くこともできます。
            </p>
          </div>
        </div>

        <div className="hrow">
          {teams.map((t) => (
            <div className="card" key={t.id.toString()}>
              <h2>{t.name}({t.memberships.length}名)</h2>
              <table>
                <tbody>
                  {t.memberships.length === 0 && (
                    <tr><td className="note">メンバーがいません。</td></tr>
                  )}
                  {t.memberships.map((m) => (
                    <tr key={m.id.toString()}>
                      <td>
                        {m.user.name}
                        {m.isLeader && <span className="pill mut" style={{ marginLeft: 6 }}>所属長</span>}
                      </td>
                      <td className="note num" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {toDateKey(m.startDate)}〜
                      </td>
                      <td style={{ textAlign: "right", width: 1 }}>
                        <form action={endMembership} style={{ display: "inline" }}>
                          <input type="hidden" name="membershipId" value={m.id.toString()} />
                          <button className="btn sm">解除</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
