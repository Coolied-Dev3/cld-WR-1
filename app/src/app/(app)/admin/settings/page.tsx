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

          <details style={{ marginTop: 14 }}>
            <summary className="btn sm" style={{ listStyle: "none", display: "inline-block" }}>
              Webhook URLの取得手順を見る
            </summary>
            <ol className="setup-steps">
              <li>
                Teamsで通知を受け取りたい<b>チャネル</b>を開き、チャネル名の右の「…」→
                <b>「ワークフロー」</b>を選択します。
              </li>
              <li>
                テンプレート一覧から
                <b>「Webhook 要求を受信したときにチャネルに投稿する」</b>を選びます。
              </li>
              <li>
                ワークフロー名(例:<code>週報システム通知</code>)を入力し、
                サインインを確認して<b>「次へ」</b>。
              </li>
              <li>投稿先のチームとチャネルが正しいことを確認して<b>「ワークフローの追加」</b>。</li>
              <li>
                表示された<b>Webhook URL</b>(<code>https://prod-…logic.azure.com/…</code>)をコピーし、
                上の欄に貼り付けて<b>「保存」</b>します。
              </li>
              <li>
                <b>「テスト送信」</b>を押し、Teamsのチャネルにテスト通知が届けば設定完了です。
              </li>
            </ol>
            <p className="note" style={{ margin: 0 }}>
              URLは後から確認できないため、控えておくことを推奨します。再取得する場合は
              Power Automate でワークフローを開き直してください。
              なお、以前の「Incoming Webhook(コネクタ)」はMicrosoftが廃止を進めているため使用しません。
            </p>
          </details>

          <p className="note" style={{ marginBottom: 0, marginTop: 12 }}>
            URLが未設定の間、通知は送信されません(システムは通常どおり動作します)。
            送信される通知は、リマインダー・締切超過・コメント・提出・低評価アラートの5種類です。
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
