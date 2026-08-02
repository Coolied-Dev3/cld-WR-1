import { prisma } from "./prisma";
import { addDays, currentWeekStart, jstToday, weekStartOf } from "./week";

/**
 * 提出締切の設定。
 *
 * 締切日は「対象週の月曜日から何日後か」(offset)で保持する。
 *   4 = 当週の金曜 / 5 = 当週の土曜 / 6 = 当週の日曜
 *   7 = 翌週の月曜 / 8 = 翌週の火曜 / 9 = 翌週の水曜 …
 * こうすることで「翌週の月曜が締切」のような設定も同じ計算式で扱える。
 */

export const DEADLINE_DAY_OPTIONS: { value: number; label: string }[] = [
  { value: 4, label: "当週の金曜" },
  { value: 5, label: "当週の土曜" },
  { value: 6, label: "当週の日曜" },
  { value: 7, label: "翌週の月曜" },
  { value: 8, label: "翌週の火曜" },
  { value: 9, label: "翌週の水曜" },
  { value: 10, label: "翌週の木曜" },
  { value: 11, label: "翌週の金曜" },
];

export type DeadlineSettings = {
  deadlineOffset: number;
  deadlineTime: string; // "HH:mm"
  reminderOffset: number;
  reminderTime: string; // "HH:mm"
};

const DEFAULTS: DeadlineSettings = {
  deadlineOffset: 4,
  deadlineTime: "18:00",
  reminderOffset: 4,
  reminderTime: "10:00",
};

function parseOffset(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return DEADLINE_DAY_OPTIONS.some((o) => o.value === n) ? n : fallback;
}

function parseTime(v: string | undefined, fallback: string): string {
  return v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
}

export async function getDeadlineSettings(): Promise<DeadlineSettings> {
  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: ["deadline_day_offset", "deadline_time", "reminder_day_offset", "reminder_time"],
      },
    },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    deadlineOffset: parseOffset(map.deadline_day_offset, DEFAULTS.deadlineOffset),
    deadlineTime: parseTime(map.deadline_time, DEFAULTS.deadlineTime),
    reminderOffset: parseOffset(map.reminder_day_offset, DEFAULTS.reminderOffset),
    reminderTime: parseTime(map.reminder_time, DEFAULTS.reminderTime),
  };
}

export function deadlineLabel(offset: number): string {
  return DEADLINE_DAY_OPTIONS.find((o) => o.value === offset)?.label ?? `${offset}日後`;
}

/** 締切日(日付のみ。UTC0時のDate) */
export function deadlineDateOf(weekStart: Date, offset: number): Date {
  return addDays(weekStart, offset);
}

/** 締切の日時(UTC)。時刻はJSTとして解釈する */
export function deadlineAtOf(weekStart: Date, offset: number, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(addDays(weekStart, offset).getTime() + ((h - 9) * 60 + m) * 60 * 1000);
}

/** 締切表示 "8/4(火) 18:00" */
export function deadlineDisplay(weekStart: Date, s: DeadlineSettings): string {
  const d = deadlineDateOf(weekStart, s.deadlineOffset);
  const dow = ["日", "月", "火", "水", "木", "金", "土"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${dow}) ${s.deadlineTime}`;
}

/**
 * いま提出すべき対象週を返す。
 *
 * 締切が翌週にずれている場合、締切日までは前週の週報を書くことになる。
 * 例) 締切が「翌週の火曜」なら、月曜・火曜は前週分を書き、水曜以降は当週分を書く。
 */
export function resolveTargetWeek(s: DeadlineSettings, now: Date = new Date()): Date {
  const thisWeek = currentWeekStart();
  const prevWeek = addDays(thisWeek, -7);
  // 前週の締切がまだ過ぎていなければ、前週が対象
  if (s.deadlineOffset >= 7 && now <= deadlineAtOf(prevWeek, s.deadlineOffset, s.deadlineTime)) {
    return prevWeek;
  }
  return thisWeek;
}

/** 今日が「対象週の締切日」に当たる場合、その対象週を返す(当たらなければ null) */
export function weekDueToday(offset: number): Date | null {
  const candidate = addDays(jstToday(), -offset);
  return candidate.getUTCDay() === 1 && weekStartOf(candidate).getTime() === candidate.getTime()
    ? candidate
    : null;
}
