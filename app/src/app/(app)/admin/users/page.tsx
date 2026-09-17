import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { MAX_TEAMS_PER_USER } from "@/lib/team-data";
import { createUser, updateUser, toggleUserActive } from "../actions";

const roleLabel: Record<string, string> = {
  member: "メンバー",
  manager: "所属長",
  executive: "役員",
  admin: "管理者",
};

type TeamOption = { id: bigint; name: string };

/** 所属の選択欄(事業室のプルダウン + 所属長チェック)。formId を指定すると表外のフォームに紐づける */
function TeamPicker(props: {
  index: number;
  teams: TeamOption[];
  teamId?: bigint;
  isLeader?: boolean;
  formId?: string;
}) {
  const { index, teams, teamId, isLeader, formId } = props;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <select
        name={`team${index}`}
        defaultValue={teamId?.toString() ?? ""}
        form={formId}
        style={{ width: "auto" }}
      >
        <option value="">―</option>
        {teams.map((t) => (
          <option key={t.id.toString()} value={t.id.toString()}>{t.name}</option>
        ))}
      </select>
      <label style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3 }}>
        <input type="checkbox" name={`leader${index}`} defaultChecked={!!isLeader} form={formId} />
        長
      </label>
    </span>
  );
}

export default async function AdminUsersPage() {
  await requireUser(["admin"]);
  const [users, teams] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { id: "asc" }],
      include: {
        memberships: { where: { endDate: null }, include: { team: true }, orderBy: { id: "asc" } },
      },
    }),
    prisma.team.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
  ]);
  const slots = Array.from({ length: MAX_TEAMS_PER_USER }, (_, i) => i + 1);

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
            {slots.map((i) => (
              <div className="fld" style={{ marginBottom: 0 }} key={i}>
                <label>所属{i}(任意)</label>
                <TeamPicker index={i} teams={teams} />
              </div>
            ))}
            <div className="fld" style={{ marginBottom: 0 }}>
              <label>初期パスワード(8文字以上)</label>
              <input type="text" name="password" required minLength={8} />
            </div>
            <div>
              <button className="btn pri">登録する</button>
            </div>
          </form>
          <p className="note" style={{ marginBottom: 0 }}>
            所属は最大{MAX_TEAMS_PER_USER}つまで登録できます。「長」にチェックするとその事業室の所属長になります
            (ロールが所属長でチェックがない場合は、選んだ事業室すべての所属長になります)。
            パスワードは平文で管理されます(ローカル運用)。
          </p>
        </div>

        <div className="card">
          <h2>ユーザー一覧({users.length}名)</h2>
          <div className="tscroll">
            <table>
              <thead>
                <tr>
                  <th>氏名</th><th>メール</th><th>社員番号</th><th>パスワード</th><th>ロール</th>
                  {slots.map((i) => <th key={i}>所属{i}</th>)}
                  <th>状態</th><th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const formId = `user-${u.id.toString()}`;
                  return (
                    <tr key={u.id.toString()}>
                      <td>
                        <input type="text" name="name" defaultValue={u.name} required form={formId} style={{ width: 120 }} />
                      </td>
                      <td>
                        <input type="email" name="email" defaultValue={u.email} required form={formId} style={{ width: 210 }} />
                      </td>
                      <td>
                        <input type="text" name="employeeCode" defaultValue={u.employeeCode ?? ""} form={formId} style={{ width: 80 }} />
                      </td>
                      <td>
                        <input type="text" name="password" defaultValue={u.password} minLength={8} form={formId} className="num" style={{ width: 120 }} />
                      </td>
                      <td>
                        <select name="role" defaultValue={u.role} form={formId} style={{ width: "auto" }}>
                          {Object.entries(roleLabel).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </td>
                      {slots.map((i) => {
                        const m = u.memberships[i - 1];
                        return (
                          <td key={i}>
                            <TeamPicker index={i} teams={teams} teamId={m?.teamId} isLeader={m?.isLeader} formId={formId} />
                          </td>
                        );
                      })}
                      <td>
                        {u.isActive ? <span className="pill ok">有効</span> : <span className="pill mut">無効</span>}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn sm pri" form={formId} style={{ marginRight: 6 }}>保存</button>
                        <form action={toggleUserActive} style={{ display: "inline" }}>
                          <input type="hidden" name="userId" value={u.id.toString()} />
                          <button className={`btn sm ${u.isActive ? "danger" : ""}`}>
                            {u.isActive ? "無効化" : "有効化"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* 行内の入力欄はこのフォームに紐づく(tr の中に form を置けないため表の外に置く) */}
          {users.map((u) => (
            <form key={u.id.toString()} id={`user-${u.id.toString()}`} action={updateUser}>
              <input type="hidden" name="userId" value={u.id.toString()} />
            </form>
          ))}
          <p className="note" style={{ margin: "10px 0 0" }}>
            各行を書き換えて「保存」を押すと反映されます。所属を「―」にするとその所属は今日付で終了し、履歴として残ります。
            退職者は「無効化」してください。過去の週報は保持されます。
          </p>
        </div>
      </div>
    </>
  );
}
