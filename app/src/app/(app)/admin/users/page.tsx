import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createUser, toggleUserActive, resetPassword } from "../actions";

const roleLabel: Record<string, string> = {
  member: "メンバー",
  manager: "所属長",
  executive: "役員",
  admin: "管理者",
};

export default async function AdminUsersPage() {
  await requireUser(["admin"]);
  const [users, teams] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { id: "asc" }],
      include: { memberships: { where: { endDate: null }, include: { team: true } } },
    }),
    prisma.team.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
  ]);

  return (
    <>
      <h1 className="pg">ユーザー管理</h1>
      <div className="stack">
        <div className="card">
          <h2>新規ユーザー登録</h2>
          <form action={createUser} className="grid2" style={{ alignItems: "end" }}>
            <div className="fld" style={{ marginBottom: 0 }}>
              <label>氏名</label>
              <input type="text" name="name" required />
            </div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <label>メールアドレス</label>
              <input type="email" name="email" required />
            </div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <label>社員番号(任意)</label>
              <input type="text" name="employeeCode" />
            </div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <label>ロール</label>
              <select name="role" defaultValue="member">
                <option value="member">メンバー</option>
                <option value="manager">所属長</option>
                <option value="executive">役員</option>
                <option value="admin">管理者</option>
              </select>
            </div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <label>所属チーム(任意)</label>
              <select name="teamId" defaultValue="">
                <option value="">なし</option>
                {teams.map((t) => (
                  <option key={t.id.toString()} value={t.id.toString()}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <label>初期パスワード(8文字以上)</label>
              <input type="text" name="password" required minLength={8} />
            </div>
            <div>
              <button className="btn pri">登録する</button>
            </div>
          </form>
          <p className="note" style={{ marginBottom: 0 }}>
            パスワードは平文で管理されます(ローカル運用)。この画面は管理者のみ閲覧できます。
          </p>
        </div>

        <div className="card">
          <h2>ユーザー一覧({users.length}名)</h2>
          <div className="tscroll">
            <table>
              <thead>
                <tr>
                  <th>氏名</th><th>メール</th><th>パスワード</th><th>ロール</th><th>所属</th><th>状態</th><th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id.toString()}>
                    <td><b>{u.name}</b></td>
                    <td className="note">{u.email}</td>
                    <td className="note num">{u.password}</td>
                    <td>{roleLabel[u.role]}</td>
                    <td>
                      {u.memberships.map((m) => m.team.name).join("・") || <span className="note">―</span>}
                    </td>
                    <td>
                      {u.isActive ? <span className="pill ok">有効</span> : <span className="pill mut">無効</span>}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <details style={{ display: "inline-block", marginRight: 8 }}>
                        <summary className="btn sm" style={{ listStyle: "none", display: "inline-block" }}>PW初期化</summary>
                        <form action={resetPassword} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <input type="hidden" name="userId" value={u.id.toString()} />
                          <input type="text" name="password" placeholder="新パスワード" minLength={8} required style={{ width: 140 }} />
                          <button className="btn sm pri">設定</button>
                        </form>
                      </details>
                      <form action={toggleUserActive} style={{ display: "inline" }}>
                        <input type="hidden" name="userId" value={u.id.toString()} />
                        <button className={`btn sm ${u.isActive ? "danger" : ""}`}>
                          {u.isActive ? "無効化" : "有効化"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ margin: "10px 0 0" }}>
            退職者は「無効化」してください。過去の週報は保持されます。
          </p>
        </div>
      </div>
    </>
  );
}
