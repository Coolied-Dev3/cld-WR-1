import { prisma } from "./prisma";
import type { NotificationType } from "@prisma/client";

/**
 * Teams通知(Power Automate「Workflows」のWebhook URLへ投稿)
 *
 * 送信するJSONは、フロー側で宛先を判断できるよう次の形にしている。
 *
 *   {
 *     "to":    "yamada@coolied.co.jp",   // 通知の宛先(この人にDMする)
 *     "title": "週報にコメントが届きました",
 *     "body":  "…",
 *     "link":  "http://192.168.x.x:3000/reports/123",
 *     "type":  "comment",
 *     "attachments": [ …Adaptive Card… ]  // 旧フロー(チャネル投稿)との互換用
 *   }
 *
 * フロー側で `to` を「Flow bot が個人にチャット投稿」の宛先に使うことで、
 * チャネルに流さず本人だけに届く。attachments は旧フローが動いている間の
 * 互換のために残してあり、個人DMへ移行後は使われない。
 */
export async function sendTeamsNotification(
  type: NotificationType,
  opts: { userId?: bigint; title: string; body: string; mentionEmail?: string; link?: string }
) {
  const url = (await getAppSetting("teams_webhook_url", "")).trim();
  if (!url) return; // 未設定なら送信しない(画面上の表示のみで運用)

  // 宛先が分からない通知は送らない(チャネルへの一斉投稿を避けるため)
  if (!opts.mentionEmail) {
    await prisma.notificationLog.create({
      data: {
        userId: opts.userId ?? null,
        type,
        payload: JSON.parse(
          JSON.stringify({ title: opts.title, body: opts.body, skipped: "宛先が未指定のため送信しませんでした" })
        ),
        status: "failed",
      },
    });
    return;
  }

  const link = opts.link ? await toAbsoluteUrl(opts.link) : undefined;

  const payload = {
    // ---- フロー側が参照する項目 ----
    to: opts.mentionEmail,
    title: opts.title,
    body: opts.body,
    link: link ?? "",
    type,
    // ---- 旧フロー(チャネル投稿)との互換用 ----
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: opts.title, weight: "Bolder", size: "Medium", wrap: true },
            { type: "TextBlock", text: opts.body, wrap: true },
            ...(link ? [{ type: "TextBlock", text: `[週報を開く](${link})`, wrap: true }] : []),
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
      payload: JSON.parse(JSON.stringify({ to: opts.mentionEmail, title: opts.title, body: opts.body })),
      status,
    },
  });
}

/** 相対パスを、設定されたアプリURLを使って絶対URLにする */
async function toAbsoluteUrl(path: string): Promise<string | undefined> {
  if (/^https?:\/\//i.test(path)) return path;
  const base = (await getAppSetting("app_base_url", "")).trim().replace(/\/+$/, "");
  if (!base) return undefined; // 未設定ならリンクを載せない(localhostは他PCから開けないため)
  return base + (path.startsWith("/") ? path : "/" + path);
}

export async function getAppSetting(key: string, fallback: string): Promise<string> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  return s?.value ?? fallback;
}
