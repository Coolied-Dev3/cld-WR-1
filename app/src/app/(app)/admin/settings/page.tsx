import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getAppSetting } from "@/lib/notify";
import { formatDateTime } from "@/lib/week";
import { updateSettings, testWebhook } from "../actions";

// Power Automate のトリガーに貼り付けるJSONスキーマ(アプリが送信する形式)
const JSON_SCHEMA = `{
  "type": "object",
  "properties": {
    "to":    { "type": "string" },
    "title": { "type": "string" },
    "body":  { "type": "string" },
    "link":  { "type": "string" },
    "type":  { "type": "string" }
  }
}`;

export default async function AdminSettingsPage() {
  await requireUser(["admin"]);
  const [webhookUrl, baseUrl, alertWeeks, recentNotifications] = await Promise.all([
    getAppSetting("teams_webhook_url", ""),
    getAppSetting("app_base_url", ""),
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
              <label>アプリのURL(通知に載せるリンク用)</label>
              <input
                type="text"
                name="app_base_url"
                defaultValue={baseUrl}
                placeholder="http://192.168.220.55:3000"
              />
              <p className="note" style={{ margin: "4px 0 0" }}>
                他のPCから開けるアドレスを設定してください。空欄の場合、通知にリンクは載りません
                (localhost は受信者の端末では開けないため)。
              </p>
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
              Teamsフローの作成手順を見る(個人チャットへ通知)
            </summary>
            <p className="note" style={{ margin: "10px 0 0" }}>
              通知は宛先(コメントを受けた本人、未提出者など)の<b>個人チャット</b>に届きます。
              チャネルには投稿されません。以下の手順でフローを作成してください。
            </p>
            <ol className="setup-steps">
              <li>
                <a href="https://make.powerautomate.com/" target="_blank" rel="noopener noreferrer">
                  Power Automate
                </a>
                を開き、<b>「作成」→「インスタント クラウド フロー」</b>を選びます。
              </li>
              <li>
                トリガーに
                <b>「HTTP 要求の受信時(When a Teams webhook request is received)」</b>を選択します。
              </li>
              <li>
                トリガーの<b>「要求本文の JSON スキーマ」</b>に次を貼り付けます。
                <pre className="code-block">{JSON_SCHEMA}</pre>
              </li>
              <li>
                次のアクションで
                <b>「チャットまたはチャネルでメッセージを投稿する」</b>を追加し、以下を設定します。
                <ul className="setup-sub">
                  <li>投稿者: <b>フロー ボット</b></li>
                  <li>投稿先: <b>グループ チャット</b> ではなく <b>チャット(Chat with Flow bot)</b></li>
                  <li>Recipient(宛先): 動的なコンテンツから <code>to</code> を選択</li>
                  <li>Message: <code>title</code> を太字にし、改行して <code>body</code>、最後に <code>link</code></li>
                </ul>
              </li>
              <li>
                保存すると<b>Webhook URL</b>が発行されるので、上の欄に貼り付けて<b>「保存」</b>します。
              </li>
              <li>
                <b>「テスト送信」</b>を押し、<b>自分あてのチャット</b>に通知が届けば完了です。
              </li>
              <li>
                旧フロー(チャネルに投稿するもの)は、動作確認後に
                Power Automate で<b>オフ</b>にしてください。
              </li>
            </ol>
            <p className="note" style={{ margin: 0 }}>
              宛先はシステムに登録されているメールアドレスです。Teams(Microsoft 365)の
              アカウントと一致している必要があります。一致しない場合、そのユーザーへの送信は失敗します。
            </p>
          </details>

          <p className="note" style={{ marginBottom: 0, marginTop: 12 }}>
            URLが未設定の間、通知は送信されません(システムは通常どおり動作します)。
            送信される通知は、リマインダー・締切超過・コメント・提出・低評価アラートの5種類で、
            いずれも宛先本人の個人チャットに届きます。
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
