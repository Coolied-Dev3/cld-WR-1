// 週の扱い: 対象週は月曜はじまり。日付はすべて「JSTの暦日」を UTC 0時の Date として扱う
// (DBの @db.Date カラムと往復してもズレない)

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 現在時刻のJST暦日を UTC0時のDateで返す */
export function jstToday(): Date {
  const now = new Date(Date.now() + JST_OFFSET_MS);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** その日を含む週の月曜日を返す */
export function weekStartOf(d: Date): Date {
  const r = new Date(d);
  const day = r.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setUTCDate(r.getUTCDate() + diff);
  return r;
}

/** 今週(JST)の月曜日 */
export function currentWeekStart(): Date {
  return weekStartOf(jstToday());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** 直近n週の月曜日リスト(新しい順) */
export function lastNWeekStarts(n: number, from?: Date): Date[] {
  const start = from ?? currentWeekStart();
  return Array.from({ length: n }, (_, i) => addDays(start, -7 * i));
}

/** "2026-07-20" 形式 */
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromDateKey(key: string): Date {
  return new Date(key + "T00:00:00Z");
}

/** "7/20週" 表示 */
export function weekLabel(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}週`;
}

/** "2026/7/20(月)〜7/26(日)" 表示 */
export function weekRangeLabel(d: Date): string {
  const end = addDays(d, 6);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}(月)〜${
    end.getUTCMonth() + 1
  }/${end.getUTCDate()}(日)`;
}

// ===== 月の扱い(週は週開始日=月曜が属する月に集計する) =====

/** "2026-07" 形式 */
export function toMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 現在(JST)の年月キー */
export function currentMonthKey(): string {
  return toMonthKey(jstToday());
}

/** "2026-07" を検証して返す。不正なら当月 */
export function normalizeMonthKey(key?: string | null): string {
  if (key && /^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return key;
  return currentMonthKey();
}

/** 月キーの範囲 [月初, 翌月初) を返す */
export function monthRange(key: string): { start: Date; end: Date } {
  const [y, m] = key.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)),
  };
}

/** "2026年7月" 表示 */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 日時表示 "7/18 17:32"(JST) */
export function formatDateTime(d: Date): string {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${j
    .getUTCHours()
    .toString()
    .padStart(2, "0")}:${j.getUTCMinutes().toString().padStart(2, "0")}`;
}
