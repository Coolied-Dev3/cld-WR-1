import cron from "node-cron";
import { prisma } from "./prisma";
import { reportingUserWhere } from "./team-data";
import { weekLabel, lastNWeekStarts, toDateKey, addDays } from "./week";
import { sendTeamsNotification, getAppSetting } from "./notify";
import { getDeadlineSettings, weekDueToday, deadlineDisplay } from "./deadline";

const globalFlags = globalThis as unknown as { cronStarted?: boolean };

/** JSTの "HH:mm" 現在時刻 */
function nowJst(): string {
  const j = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${j.getUTCHours().toString().padStart(2, "0")}:${j.getUTCMinutes().toString().padStart(2, "0")}`;
}

/** 同じ週・同じ種別の通知を二重送信しないための記録 */
async function alreadySent(type: "reminder" | "overdue" | "alert", marker: string) {
  const log = await prisma.notificationLog.findFirst({
    where: { type, payload: { path: "$.marker", equals: marker } },
  });
  return !!log;
}

async function markSent(type: "reminder" | "overdue" | "alert", marker: string) {
  await prisma.notificationLog.create({
    data: { type, payload: { marker }, status: "success" },
  });
}

/** 指定週の未提出者(提出対象ロールのみ)。提出不要週なら null */
async function getUnsubmitted(weekStart: Date) {
  const skip = await prisma.skipWeek.findUnique({ where: { weekStartDate: weekStart } });
  if (skip) return null;
  const memberships = await prisma.teamMembership.findMany({
    where: { endDate: null, user: reportingUserWhere },
    include: { user: true },
  });
  const submitted = await prisma.weeklyReport.findMany({
    where: { weekStartDate: weekStart, status: { not: "draft" } },
    select: { userId: true },
  });
  const submittedIds = new Set(submitted.map((r) => r.userId.toString()));
  return memberships.filter((m) => !submittedIds.has(m.userId.toString()));
}

/** リマインダー: 設定された「リマインダー日」の指定時刻を過ぎたら1回だけ送る */
async function runReminderCheck() {
  const s = await getDeadlineSettings();
  const weekStart = weekDueToday(s.reminderOffset);
  if (!weekStart) return; // 今日はリマインダー日ではない
  if (nowJst() < s.reminderTime) return;

  const marker = `reminder-${toDateKey(weekStart)}`;
  if (await alreadySent("reminder", marker)) return;

  const unsubmitted = await getUnsubmitted(weekStart);
  if (!unsubmitted) return;
  await markSent("reminder", marker);

  for (const m of unsubmitted) {
    await sendTeamsNotification("reminder", {
      userId: m.userId,
      title: "週報提出のお願い",
      body: `${m.user.name} さん、${weekLabel(weekStart)} の週報が未提出です。提出締切は ${deadlineDisplay(weekStart, s)} です。`,
      mentionEmail: m.user.email,
      link: "/reports/edit",
    });
  }
}

/** 締切超過: 設定された「締切日」の締切時刻を過ぎたら1回だけ送る */
async function runOverdueCheck() {
  const s = await getDeadlineSettings();
  const weekStart = weekDueToday(s.deadlineOffset);
  if (!weekStart) return; // 今日は締切日ではない
  if (nowJst() < s.deadlineTime) return;

  const marker = `overdue-${toDateKey(weekStart)}`;
  if (await alreadySent("overdue", marker)) return;

  const unsubmitted = await getUnsubmitted(weekStart);
  if (!unsubmitted) return;
  await markSent("overdue", marker);

  const leaders = await prisma.teamMembership.findMany({
    where: { endDate: null, isLeader: true },
    include: { user: true },
  });

  for (const m of unsubmitted) {
    await sendTeamsNotification("overdue", {
      userId: m.userId,
      title: "週報が未提出です(締切超過)",
      body: `${m.user.name} さんの ${weekLabel(weekStart)} の週報が締切を過ぎても未提出です。`,
      mentionEmail: m.user.email,
      link: "/reports/edit",
    });
    // 所属長が複数いる場合は全員に通知する
    for (const leader of leaders.filter((l) => l.teamId === m.teamId && l.userId !== m.userId)) {
      await sendTeamsNotification("overdue", {
        userId: leader.userId,
        title: "メンバーの週報が未提出です",
        body: `${m.user.name} さんの ${weekLabel(weekStart)} の週報が未提出です。`,
        mentionEmail: leader.user.email,
        link: "/team/status",
      });
    }
  }

  // 締切後に低評価の連続をチェックする
  await runLowRatingAlert(weekStart);
}

async function runLowRatingAlert(weekStart: Date) {
  const marker = `alert-${toDateKey(weekStart)}`;
  if (await alreadySent("alert", marker)) return;
  await markSent("alert", marker);

  const alertWeeks = Number(await getAppSetting("alert_consecutive_low_weeks", "3"));
  const weeks = lastNWeekStarts(alertWeeks + 2, weekStart); // 締切を迎えた週から遡る
  const memberships = await prisma.teamMembership.findMany({
    where: { endDate: null, user: reportingUserWhere },
    include: { user: true },
  });
  const leaders = await prisma.teamMembership.findMany({
    where: { endDate: null, isLeader: true },
    include: { user: true },
  });
  const reports = await prisma.weeklyReport.findMany({
    where: { weekStartDate: { in: weeks }, status: { not: "draft" } },
  });

  for (const m of memberships) {
    let streak = 0;
    for (const w of weeks) {
      const r = reports.find(
        (x) => x.userId === m.userId && toDateKey(x.weekStartDate) === toDateKey(w)
      );
      if (r && (r.selfRating === "fair" || r.selfRating === "poor")) streak++;
      else if (r) break;
    }
    if (streak >= alertWeeks) {
      for (const leader of leaders.filter((l) => l.teamId === m.teamId && l.userId !== m.userId)) {
        await sendTeamsNotification("alert", {
          userId: leader.userId,
          title: "低評価が連続しているメンバーがいます",
          body: `${m.user.name} さんの自己評価が${streak}週連続で△・✕です。個別フォローを検討してください。`,
          mentionEmail: leader.user.email,
          link: `/team/personal?user=${m.userId}`,
        });
      }
    }
  }
}

export function startCron() {
  if (globalFlags.cronStarted) return;
  globalFlags.cronStarted = true;

  // 締切日は設定で変わる(当週の金曜〜翌週の金曜)ため、毎日5分おきに確認し、
  // 設定された日・時刻を過ぎたタイミングで1回だけ送信する
  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await runReminderCheck();
        await runOverdueCheck();
      } catch (e) {
        console.error("[cron] notification check failed:", e);
      }
    },
    { timezone: "Asia/Tokyo" }
  );

  console.log("[cron] weekly-report notification scheduler started");
}
