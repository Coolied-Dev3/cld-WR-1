import { prisma } from "./prisma";
import type { NotificationType } from "@prisma/client";

/**
 * Teams通知(Power Automate「Workflows」のWebhook URLへ投稿)
 * Workflows側は「Webhook要求を受信したときにチャネルに投稿する」テンプレートを想定。
 * Adaptive Card形式のJSONを送る。
 */
export async function sendTeamsNotification(
  type: NotificationType,
  opts: { userId?: bigint; title: string; body: string; mentionEmail?: string; link?: string }
) {
  const setting = await prisma.appSetting.findUnique({ where: { key: "teams_webhook_url" } });
  const url = setting?.value?.trim();
  if (!url) return; // 未設定なら送信しない(画面上の表示のみで運用)

  const bodyLines = [opts.body];
  if (opts.mentionEmail) bodyLines.push(`(宛先: ${opts.mentionEmail})`);
  const payload = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: opts.title, weight: "Bolder", size: "Medium", wrap: true },
            { type: "TextBlock", text: bodyLines.join("\n"), wrap: true },
            ...(opts.link
              ? [{ type: "TextBlock", text: `[週報システムを開く](${opts.link})`, wrap: true }]
              : []),
          ],
        },
      },
    ],
  };

  let status: "success" | "failed" = "success";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) status = "failed";
  } catch {
    status = "failed";
  }
  await prisma.notificationLog.create({
    data: {
      userId: opts.userId ?? null,
      type,
      payload: JSON.parse(JSON.stringify({ title: opts.title, body: opts.body })),
      status,
    },
  });
}

export async function getAppSetting(key: string, fallback: string): Promise<string> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  return s?.value ?? fallback;
}
