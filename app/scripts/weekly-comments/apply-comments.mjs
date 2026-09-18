/**
 * 確認済みのコメントを comments テーブルへ登録し、週報を「確認済み」にし、本人へ Teams 通知を送る。
 *
 *   node scripts/weekly-comments/apply-comments.mjs <sheet.json> [--author 13] [--dry-run]
 *                                                   [--no-confirm] [--no-notify] [--allow-self]
 *
 * read-sheet.py の出力を入力にとる。--dry-run では登録内容の確認だけを行いDBは変更しない。
 * 画面からのコメント投稿・確認(src/app/(app)/reports/[id]/actions.ts の addComment /
 * confirmReport)と同じ処理を行う。
 *   - comments / report_confirmations への登録と audit_logs への記録
 *   - 週報の本人への Teams 通知(src/lib/notify.ts の sendTeamsNotification と同じ payload、
 *     notification_logs にも記録)。Webhook URL(app_settings.teams_webhook_url)が未設定なら送らない
 *
 * コメントは次の週報をスキップする。
 *   - 投稿者本人の週報(画面と同じくトップレベルのコメントは付けられない)。
 *     通知テストなどで必要な場合だけ --allow-self で登録できる(通知は本人=投稿者に届く)
 *   - 同じ投稿者のトップレベルのコメントが既にある週報(二重投稿の防止)
 *
 * 「確認済み」は、コメントが二重投稿で見送られた週報にも付ける(既に確認済みなら日時を更新)。
 * 投稿者本人の週報と閲覧権限のない週報は、画面と同じく確認済みにできない。
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** src/lib/week.ts の weekLabel と同じ表記("8/31週") */
function weekLabel(d) {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}週`;
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("入力JSONを指定してください");
  const dryRun = process.argv.includes("--dry-run");
  const confirmToo = !process.argv.includes("--no-confirm");
  const notify = !process.argv.includes("--no-notify");
  const allowSelf = process.argv.includes("--allow-self");
  const authorId = BigInt(arg("author", "13"));

  const author = await prisma.user.findUnique({ where: { id: authorId } });
  if (!author || !author.isActive) throw new Error(`投稿者(id=${authorId})が見つかりません`);
  if (!["manager", "executive"].includes(author.role)) {
    throw new Error(`投稿者 ${author.name} のロール(${author.role})ではコメントできません`);
  }

  const webhookUrl = (await getAppSetting("teams_webhook_url", "")).trim();
  const baseUrl = (await getAppSetting("app_base_url", "")).trim().replace(/\/+$/, "");

  const { items } = JSON.parse(readFileSync(input, "utf8"));
  const plan = [];

  for (const item of items) {
    const reportId = BigInt(item.reportId);
    const report = await prisma.weeklyReport.findUnique({
      where: { id: reportId },
      include: {
        user: { select: { name: true, email: true } },
        team: { select: { name: true } },
        comments: { where: { userId: authorId, parentCommentId: null }, select: { id: true } },
        confirmations: { where: { userId: authorId }, select: { id: true } },
      },
    });

    const label = report ? `${report.team.name} / ${report.user.name}` : item.name;
    const base = { ...item, reportId, report, label };
    // 確認済みは、本人の週報でなく、まだ確認していない場合だけ付ける(付け直しはしない)
    const canConfirm = (r) => confirmToo && r.userId !== authorId && r.confirmations.length === 0;
    if (!report) {
      plan.push({ ...base, action: "skip", confirm: false, reason: "週報が見つかりません" });
    } else if (report.userId === authorId && !allowSelf) {
      plan.push({ ...base, action: "skip", confirm: false, reason: "投稿者本人の週報(--allow-self で登録可)" });
    } else if (author.role === "manager" && report.teamId !== (await teamIdOf(authorId))) {
      plan.push({ ...base, action: "skip", confirm: false, reason: "所属外の事業室の週報" });
    } else if (report.comments.length > 0) {
      // コメントは見送るが、未確認なら確認済みにはする
      plan.push({
        ...base,
        action: "skip",
        confirm: canConfirm(report),
        reason: "同じ投稿者のコメントが既にあります",
      });
    } else {
      plan.push({ ...base, action: "create", confirm: canConfirm(report) });
    }
  }

  const creates = plan.filter((p) => p.action === "create");
  const skips = plan.filter((p) => p.action === "skip");
  const confirms = plan.filter((p) => p.confirm);

  console.log(`投稿者: ${author.name} (${author.role}, id=${authorId})`);
  console.log(
    `Teams通知: ${!notify ? "送らない(--no-notify)" : webhookUrl ? "送る" : "送らない(Webhook URL 未設定)"}`,
  );
  for (const p of plan) {
    const head = p.action === "create" ? "登録" : `コメント見送り(${p.reason})`;
    const mark = (p.confirm ? " +確認済み" : "") + (p.action === "create" && notify && webhookUrl ? " +通知" : "");
    console.log(`  [${head}${mark}] 週報${p.reportId} ${p.label} : ${p.content.slice(0, 40)}...`);
  }

  if (dryRun) {
    console.log(
      `\n--dry-run のため登録していません(コメント ${creates.length}件 / 確認済み ${confirms.length}件 / 見送り ${skips.length}件)`,
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of creates) {
      const comment = await tx.comment.create({
        data: { reportId: p.reportId, userId: authorId, parentCommentId: null, content: p.content },
      });
      await tx.auditLog.create({
        data: {
          userId: authorId,
          action: "comment.create",
          targetType: "comments",
          targetId: p.reportId,
          detail: { commentId: String(comment.id), source: "weekly-comments-sheet" },
        },
      });
    }
    for (const p of confirms) {
      await tx.reportConfirmation.upsert({
        where: { reportId_userId: { reportId: p.reportId, userId: authorId } },
        update: { confirmedAt: new Date() },
        create: { reportId: p.reportId, userId: authorId },
      });
      await tx.auditLog.create({
        data: {
          userId: authorId,
          action: "report.confirm",
          targetType: "weekly_reports",
          targetId: p.reportId,
          detail: { source: "weekly-comments-sheet" },
        },
      });
    }
  });

  console.log(
    `\n登録しました: コメント ${creates.length}件 / 確認済み ${confirms.length}件 / コメント見送り ${skips.length}件`,
  );

  // 通知はDB登録が確定してから送る(トランザクション外)。失敗しても登録は取り消さない
  if (notify && webhookUrl && creates.length > 0) {
    let ok = 0;
    for (const p of creates) {
      const status = await sendTeamsNotification(webhookUrl, baseUrl, {
        userId: p.report.userId,
        to: p.report.user.email,
        title: "週報にコメントが届きました",
        body: `${author.name} さんが ${weekLabel(p.report.weekStartDate)} の週報にコメントしました。`,
        link: `/reports/${p.reportId}`,
      });
      console.log(`  [通知 ${status === "success" ? "OK" : "失敗"}] ${p.report.user.name} <${p.report.user.email}>`);
      if (status === "success") ok++;
    }
    console.log(`Teams通知: 成功 ${ok}件 / 失敗 ${creates.length - ok}件(結果は notification_logs にも記録)`);
  }
}

/** src/lib/notify.ts の sendTeamsNotification と同じ payload・ログ形式 */
async function sendTeamsNotification(url, baseUrl, opts) {
  const link = baseUrl ? baseUrl + opts.link : undefined;
  const payload = {
    to: opts.to,
    title: opts.title,
    body: opts.body,
    link: link ?? "",
    type: "comment",
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

  let status = "success";
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
      userId: opts.userId,
      type: "comment",
      payload: { to: opts.to, title: opts.title, body: opts.body },
      status,
    },
  });
  return status;
}

async function getAppSetting(key, fallback) {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  return s?.value ?? fallback;
}

/** 所属長が現在所属している事業室(コメント可能な範囲の判定用) */
async function teamIdOf(userId) {
  const m = await prisma.teamMembership.findFirst({
    where: { userId, endDate: null },
    select: { teamId: true },
  });
  return m?.teamId ?? null;
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
