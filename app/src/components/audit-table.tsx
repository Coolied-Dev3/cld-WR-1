import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/week";

const actionLabels: Record<string, string> = {
  "auth.login": "ログイン",
  "auth.change_password": "パスワード変更",
  "report.submit": "週報提出",
  "report.save_draft": "週報下書き保存",
  "report.confirm": "週報確認",
  "comment.create": "コメント投稿",
  "notify.manual_reminder": "手動リマインド送信",
  "user.create": "ユーザー作成",
  "user.update": "ユーザー更新",
  "user.deactivate": "ユーザー無効化",
  "team.create": "チーム作成",
  "team.assign": "所属設定",
  "master.create": "マスタ追加",
  "master.toggle": "マスタ有効/無効",
  "setting.update": "設定変更",
  "skipweek.create": "提出不要週追加",
  "skipweek.delete": "提出不要週削除",
};

export async function AuditTable() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: true },
  });
  return (
    <div className="card">
      <div className="tscroll">
        <table>
          <thead>
            <tr><th>日時</th><th>操作者</th><th>操作</th><th>対象</th></tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={4} className="note">ログはありません。</td></tr>
            )}
            {logs.map((l) => (
              <tr key={l.id.toString()}>
                <td className="num note">{formatDateTime(l.createdAt)}</td>
                <td>{l.user.name}</td>
                <td>{actionLabels[l.action] ?? l.action}</td>
                <td className="note">
                  {l.targetType}
                  {l.targetId ? ` #${l.targetId}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ margin: "10px 0 0" }}>直近100件を表示しています。</p>
    </div>
  );
}
