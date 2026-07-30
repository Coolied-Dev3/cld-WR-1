import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { toDateKey, jstToday } from "@/lib/week";
import { createTeam, assignMembership } from "../actions";

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
            <h2>所属設定(異動)</h2>
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
                異動先
                <select name="teamId" required>
                  {teams.map((t) => (
                    <option key={t.id.toString()} value={t.id.toString()}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label>
                異動日
                <input type="date" name="startDate" defaultValue={toDateKey(jstToday())} required style={{ width: "auto" }} />
              </label>
              <label>
                <input type="checkbox" name="isLeader" /> 所属長にする
              </label>
              <button className="btn pri sm">設定</button>
            </form>
            <p className="note" style={{ marginBottom: 0 }}>
              現在の所属は異動日の前日で終了し、履歴として保持されます。過去の週報は当時のチームの統計に残ります。
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
                      <td className="note num" style={{ textAlign: "right" }}>
                        {toDateKey(m.startDate)}〜
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
