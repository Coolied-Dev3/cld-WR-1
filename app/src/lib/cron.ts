import cron from "node-cron";
import { prisma } from "./prisma";
import { reportingUserWhere } from "./team-data";
import { currentWeekStart, weekLabel, lastNWeekStarts, toDateKey } from "./week";
import { sendTeamsNotification, getAppSetting } from "./notify";

const globalFlags = globalThis as unknown as { cronStarted?: boolean };

/** JSTの "HH:mm" 現在時刻 */
function nowJst(): string {
  const j = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${j.getUTCHours().toString().padStart(2, "0")}:${j.getUTCMinutes().toString().padStart(2, "0")}`;
}

async function alreadySentThisWeek(type: "reminder" | "overdue" | "alert", marker: string) {
  const weekStart = currentWeekStart();
  const log = await prisma.notificationLog.findFirst({
    where: { type, sentAt: { gte: weekStart }, payload: { path: "$.marker", equals: marker } },
  });
  return !!log;
}

async function markSent(type: "reminder" | "overdue" | "alert", marker: string) {
  await prisma.notificationLog.create({
    data: { type, payload: { marker }, status: "success" },
  });
}

/** 未提出者リスト(activeな member/manager/executive で今週の提出なし) */
async function getUnsubmitted() {
  const weekStart = currentWeekStart();
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

async function runReminderCheck() {
  const weekStart = currentWeekStart();
  const weekKey = toDateKey(weekStart);
  const reminderTime = await getAppSetting("reminder_time", "10:00");
  if (nowJst() < reminderTime) return;
  if (await alreadySentThisWeek("reminder", `auto-${weekKey}`)) return;

  const unsubmitted = await getUnsubmitted();
  if (!unsubmitted) return; // 提出不要週
  await markSent("reminder", `auto-${weekKey}`);
  for (const m of unsubmitted) {
    await sendTeamsNotification("reminder", {
      userId: m.userId,
      title: "週報提出のお願い",
      body: `${m.user.name} さん、本日は週報の提出日です。${weekLabel(weekStart)} の週報を提出してください。`,
      mentionEmail: m.user.email,
    });
  }
}

async function runOverdueCheck() {
  const weekStart = currentWeekStart();
  const weekKey = toDateKey(weekStart);
  const deadlineTime = await getAppSetting("deadline_time", "18:00");
  if (nowJst() < deadlineTime) return;
  if (await alreadySentThisWeek("overdue", `auto-${weekKey}`)) return;

  const unsubmitted = await getUnsubmitted();
  if (!unsubmitted) return;
  await markSent("overdue", `auto-${weekKey}`);

  // 本人+所属長へ
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
    });
    for (const leader of leaders.filter((l) => l.teamId === m.teamId && l.userId !== m.userId)) {
      await sendTeamsNotification("overdue", {
        userId: leader.userId,
        title: "メンバーの週報が未提出です",
        body: `${m.user.name} さんの ${weekLabel(weekStart)} の週報が未提出です(所属長: ${leader.user.name} さん宛)。`,
        mentionEmail: leader.user.email,
      });
    }
  }

  // 低評価連続アラート(締切後に判定)
  await runLowRatingAlert(weekKey);
}

async function runLowRatingAlert(weekKey: string) {
  if (await alreadySentThisWeek("alert", `auto-${weekKey}`)) return;
  await markSent("alert", `auto-${weekKey}`);

  const alertWeeks = Number(await getAppSetting("alert_consecutive_low_weeks", "3"));
  const weeks = lastNWeekStarts(alertWeeks + 2); // 新しい順
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
        });
      }
    }
  }
}

export function startCron() {
  if (globalFlags.cronStarted) return;
  globalFlags.cronStarted = true;

  // 金曜のみ5分おきにチェック(設定時刻を過ぎたら1回だけ送信)
  cron.schedule("*/5 * * * 5", async () => {
    try {
      await runReminderCheck();
      await runOverdueCheck();
    } catch (e) {
      console.error("[cron] notification check failed:", e);
    }
  }, { timezone: "Asia/Tokyo" });

  console.log("[cron] weekly-report notification scheduler started");
}
