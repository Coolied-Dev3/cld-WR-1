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

type LeaderRow = { userId: bigint; teamId: bigint; user: { name: string; email: string } };

/**
 * 現所属を人単位にまとめる(2つの事業室に所属する人も1件にし、所属する全事業室IDを持たせる)。
 * 通知を同じ人に二重送信しないため。
 */
async function getReportingUsers() {
  const memberships = await prisma.teamMembership.findMany({
    where: { endDate: null, user: reportingUserWhere },
    include: { user: true },
  });
  const byUser = new Map<string, { userId: bigint; user: (typeof memberships)[number]["user"]; teamIds: bigint[] }>();
  for (const m of memberships) {
    const key = m.userId.toString();
    const e = byUser.get(key);
    if (e) e.teamIds.push(m.teamId);
    else byUser.set(key, { userId: m.userId, user: m.user, teamIds: [m.teamId] });
  }
  return [...byUser.values()];
}

/** 本人が所属する全事業室の所属長(本人を除く。同じ人は1回だけ) */
function leadersFor(leaders: LeaderRow[], teamIds: bigint[], excludeUserId: bigint) {
  const seen = new Set<string>();
  return leaders.filter((l) => {
    if (l.userId === excludeUserId || !teamIds.includes(l.teamId)) return false;
    const key = l.userId.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 指定週の未提出者(提出対象ロールのみ、人単位)。提出不要週なら null */
async function getUnsubmitted(weekStart: Date) {
  const skip = await prisma.skipWeek.findUnique({ where: { weekStartDate: weekStart } });
  if (skip) return null;
  const users = await getReportingUsers();
  const submitted = await prisma.weeklyReport.findMany({
    where: { weekStartDate: weekStart, status: { not: "draft" } },
    select: { userId: true },
  });
  const submittedIds = new Set(submitted.map((r) => r.userId.toString()));
  return users.filter((u) => !submittedIds.has(u.userId.toString()));
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
    // 所属する全事業室の所属長に通知する(所属長が複数いる場合も全員)
    for (const leader of leadersFor(leaders, m.teamIds, m.userId)) {
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
  const users = await getReportingUsers();
  const leaders = await prisma.teamMembership.findMany({
    where: { endDate: null, isLeader: true },
    include: { user: true },
  });
  const reports = await prisma.weeklyReport.findMany({
    where: { weekStartDate: { in: weeks }, status: { not: "draft" } },
  });

  for (const m of users) {
    let streak = 0;
    for (const w of weeks) {
      const r = reports.find(
        (x) => x.userId === m.userId && toDateKey(x.weekStartDate) === toDateKey(w)
      );
      if (r && (r.selfRating === "fair" || r.selfRating === "poor")) streak++;
      else if (r) break;
    }
    if (streak >= alertWeeks) {
      for (const leader of leadersFor(leaders, m.teamIds, m.userId)) {
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
