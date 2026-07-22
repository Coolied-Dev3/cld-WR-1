import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getAppSetting } from "@/lib/notify";
import { toDateKey, weekRangeLabel } from "@/lib/week";
import { addSkipWeek, deleteSkipWeek, updateSettings } from "../actions";

export default async function AdminWeeksPage() {
  await requireUser(["admin"]);
  const [skipWeeks, deadlineTime, reminderTime] = await Promise.all([
    prisma.skipWeek.findMany({ orderBy: { weekStartDate: "desc" }, take: 30 }),
    getAppSetting("deadline_time", "18:00"),
    getAppSetting("reminder_time", "10:00"),
  ]);

  return (
    <>
      <h1 className="pg">週・締切設定</h1>
      <div className="stack">
        <div className="card">
          <h2>締切・リマインダー時刻</h2>
          <form action={updateSettings} className="filterbar">
            <label>
              提出締切(金曜)
              <input type="time" name="deadline_time" defaultValue={deadlineTime} style={{ width: "auto" }} />
            </label>
            <label>
              リマインダー送信(金曜)
              <input type="time" name="reminder_time" defaultValue={reminderTime} style={{ width: "auto" }} />
            </label>
            <button className="btn pri sm">保存</button>
          </form>
          <p className="note" style={{ marginBottom: 0 }}>
            リマインダーは金曜の指定時刻に未提出者へ、締切超過通知は締切の5分後に送信されます。
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
