import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getAppSetting } from "@/lib/notify";
import { formatDateTime } from "@/lib/week";
import { updateSettings, testWebhook } from "../actions";

export default async function AdminSettingsPage() {
  await requireUser(["admin"]);
  const [webhookUrl, alertWeeks, recentNotifications] = await Promise.all([
    getAppSetting("teams_webhook_url", ""),
    getAppSetting("alert_consecutive_low_weeks", "3"),
    prisma.notificationLog.findMany({ orderBy: { sentAt: "desc" }, take: 10, include: { user: true } }),
  ]);

  return (
    <>
      <h1 className="pg">システム設定</h1>
      <div className="stack">
        <div className="card">
          <h2>Teams通知(Power Automate Workflows)</h2>
          <form action={updateSettings}>
            <div className="fld">
              <label>Webhook URL</label>
              <input
                type="text"
                name="teams_webhook_url"
                defaultValue={webhookUrl}
                placeholder="https://prod-XX.japaneast.logic.azure.com/workflows/…"
              />
            </div>
            <div className="fld">
              <label>低評価アラートの連続週数</label>
              <select name="alert_consecutive_low_weeks" defaultValue={alertWeeks} style={{ width: "auto" }}>
                {["2", "3", "4"].map((v) => (
                  <option key={v} value={v}>{v}週連続</option>
                ))}
              </select>
            </div>
            <button className="btn pri">保存</button>
          </form>
          <form action={testWebhook} style={{ marginTop: 10 }}>
            <button className="btn sm">テスト送信</button>
          </form>
          <p className="note" style={{ marginBottom: 0 }}>
            Teamsの対象チャネルで「ワークフロー」→「Webhook 要求を受信したときにチャネルに投稿する」を作成し、
            発行されたURLを貼り付けてください。URLが未設定の間、通知は送信されません(システムは通常どおり動作します)。
          </p>
        </div>

        <div className="card">
          <h2>最近の通知履歴</h2>
          <table>
            <thead>
              <tr><th>日時</th><th>種別</th><th>宛先</th><th>結果</th></tr>
            </thead>
            <tbody>
              {recentNotifications.length === 0 && (
                <tr><td colSpan={4} className="note">通知履歴はありません。</td></tr>
              )}
              {recentNotifications.map((n) => (
                <tr key={n.id.toString()}>
                  <td className="num note">{formatDateTime(n.sentAt)}</td>
                  <td>{n.type}</td>
                  <td>{n.user?.name ?? "―"}</td>
                  <td>
                    {n.status === "success" ? (
                      <span className="pill good">成功</span>
                    ) : (
                      <span className="pill bad">失敗</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
