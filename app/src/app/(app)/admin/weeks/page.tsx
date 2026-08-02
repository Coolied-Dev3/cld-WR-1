import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { toDateKey, weekRangeLabel, currentWeekStart } from "@/lib/week";
import {
  getDeadlineSettings,
  DEADLINE_DAY_OPTIONS,
  deadlineDisplay,
  resolveTargetWeek,
} from "@/lib/deadline";
import { addSkipWeek, deleteSkipWeek, updateSettings } from "../actions";

export default async function AdminWeeksPage() {
  await requireUser(["admin"]);
  const [skipWeeks, settings] = await Promise.all([
    prisma.skipWeek.findMany({ orderBy: { weekStartDate: "desc" }, take: 30 }),
    getDeadlineSettings(),
  ]);

  const thisWeek = currentWeekStart();
  const targetWeek = resolveTargetWeek(settings);

  return (
    <>
      <h1 className="pg">週・締切設定</h1>
      <div className="stack">
        <div className="card">
          <h2>提出締切とリマインダー</h2>
          <form action={updateSettings} className="stack" style={{ gap: 12 }}>
            <div className="filterbar">
              <label>
                提出締切
                <select name="deadline_day_offset" defaultValue={String(settings.deadlineOffset)}>
                  {DEADLINE_DAY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <input
                type="time"
                name="deadline_time"
                defaultValue={settings.deadlineTime}
                style={{ width: "auto" }}
                aria-label="提出締切の時刻"
              />
            </div>
            <div className="filterbar">
              <label>
                リマインダー送信
                <select name="reminder_day_offset" defaultValue={String(settings.reminderOffset)}>
                  {DEADLINE_DAY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <input
                type="time"
                name="reminder_time"
                defaultValue={settings.reminderTime}
                style={{ width: "auto" }}
                aria-label="リマインダー送信の時刻"
              />
            </div>
            <div>
              <button className="btn pri sm">保存</button>
            </div>
          </form>

          <div className="alert" style={{ marginTop: 14 }}>
            <span className="ic">i</span>
            <span>
              現在の設定では、<b>{weekRangeLabel(thisWeek)}</b> の週報の締切は{" "}
              <b>{deadlineDisplay(thisWeek, settings)}</b> です。
              <br />
              いま提出対象になっているのは <b>{weekRangeLabel(targetWeek)}</b> の週報です。
            </span>
          </div>

          <p className="note" style={{ marginBottom: 0 }}>
            締切を「翌週の月曜」以降にすると、締切日までは前の週の週報を書くことになります
            (例: 締切が翌週の火曜なら、月曜・火曜は前週分を入力し、水曜から当週分に切り替わります)。
            未提出者へのリマインダーは指定日時に、締切超過の通知は締切時刻を過ぎたタイミングで、
            それぞれ1回だけ送信されます。
          </p>
        </div>

        <div className="card">
          <h2>提出不要週</h2>
          <form action={addSkipWeek} className="filterbar" style={{ marginBottom: 12 }}>
            <label>
              対象週(週内の任意の日)
              <input type="date" name="week" required style={{ width: "auto" }} />
            </label>
            <input type="text" name="reason" placeholder="理由(例: 年末年始休暇)" required style={{ width: 220 }} />
            <button className="btn pri sm">追加</button>
          </form>
          <table>
            <thead>
              <tr><th>対象週</th><th>理由</th><th></th></tr>
            </thead>
            <tbody>
              {skipWeeks.length === 0 && (
                <tr><td colSpan={3} className="note">提出不要週はありません。</td></tr>
              )}
              {skipWeeks.map((s) => (
                <tr key={s.id.toString()}>
                  <td className="num">{weekRangeLabel(s.weekStartDate)}</td>
                  <td>{s.reason}</td>
                  <td style={{ textAlign: "right" }}>
                    <form action={deleteSkipWeek}>
                      <input type="hidden" name="id" value={s.id.toString()} />
                      <button className="btn sm danger">削除</button>
                    </form>
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
