import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getViewableMembers } from "@/lib/team-data";
import {
  currentWeekStart,
  weekStartOf,
  weekRangeLabel,
  addDays,
  toDateKey,
  fromDateKey,
  formatDateTime,
} from "@/lib/week";
import { ratingMark, ratingClass } from "@/lib/labels";
import { sendReminder } from "./actions";

export default async function StatusPage(props: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireUser(["manager", "executive"]);
  const { week } = await props.searchParams;

  const thisWeek = currentWeekStart();
  // 対象週。未指定・不正な値ならログイン日の週
  let weekStart = thisWeek;
  if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const parsed = weekStartOf(fromDateKey(week));
    if (!Number.isNaN(parsed.getTime())) weekStart = parsed;
  }
  const isCurrentWeek = toDateKey(weekStart) === toDateKey(thisWeek);
  const prevWeek = toDateKey(addDays(weekStart, -7));
  const nextWeek = toDateKey(addDays(weekStart, 7));

  const members = await getViewableMembers(user);
  if (members.length === 0) redirect("/");

  const [reports, skip] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: {
        weekStartDate: weekStart,
        userId: { in: members.map((m) => m.id) },
        status: { not: "draft" },
      },
      include: { confirmations: { where: { userId: user.id } } },
    }),
    prisma.skipWeek.findUnique({ where: { weekStartDate: weekStart } }),
  ]);

  const reportOf = (userId: bigint) => reports.find((r) => r.userId === userId);

  const submittedCount = members.filter((m) => reportOf(m.id)).length;
  const unsubmittedCount = members.length - submittedCount;
  const unconfirmedCount = reports.filter(
    (r) => r.userId !== user.id && r.confirmations.length === 0
  ).length;
  const deadline = addDays(weekStart, 4); // 金曜

  return (
    <>
      <h1 className="pg">
        提出状況一覧
        <small>{user.role === "executive" ? "全社" : "自事業室"}・役員を除く{members.length}名</small>
      </h1>
      <div className="stack">
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div className="weeknav">
            <Link href={`/team/status?week=${prevWeek}`} className="btn sm">‹ 前週</Link>
            <span className="cur num">{weekRangeLabel(weekStart)}</span>
            <Link
              href={`/team/status?week=${nextWeek}`}
              className={`btn sm${isCurrentWeek ? " disabled" : ""}`}
              aria-disabled={isCurrentWeek}
            >
              翌週 ›
            </Link>
          </div>
          {!isCurrentWeek && (
            <Link href="/team/status" className="btn sm">今週へ戻る</Link>
          )}
          <span style={{ flex: 1 }} />
          {unsubmittedCount > 0 && !skip && (
            <form action={sendReminder}>
              <input type="hidden" name="week" value={toDateKey(weekStart)} />
              <button className="btn sm">未提出者{unsubmittedCount}名にまとめて送信</button>
            </form>
          )}
        </div>

        {skip && (
          <div className="alert">
            <span className="ic">i</span>
            <span>この週は提出不要週です({skip.reason})。</span>
          </div>
        )}

        <div className="kpis">
          <div className="kpi">
            <div className="k">提出率</div>
            <div className="v num">
              {members.length ? Math.round((submittedCount / members.length) * 100) : 0}%
            </div>
            <div className="s note num">{submittedCount} / {members.length}名</div>
          </div>
          <div className="kpi">
            <div className="k">未提出</div>
            <div className="v num" style={{ color: unsubmittedCount > 0 ? "var(--bad)" : undefined }}>
              {unsubmittedCount}名
            </div>
            <div className="s note num">
              締切: {deadline.getUTCMonth() + 1}/{deadline.getUTCDate()}(金)
            </div>
          </div>
          <div className="kpi">
            <div className="k">確認待ち</div>
            <div className="v num" style={{ color: unconfirmedCount > 0 ? "var(--warn)" : undefined }}>
              {unconfirmedCount}件
            </div>
            <div className="s note">自分が未確認の週報</div>
          </div>
        </div>

        <div className="card">
          <div className="tscroll">
            <table>
              <thead>
                <tr>
                  <th>氏名</th><th>事業室</th><th>状態</th><th>評価</th>
                  <th>提出日時</th><th>確認</th><th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const r = reportOf(m.id);
                  return (
                    <tr key={m.id.toString()}>
                      <td>
                        <b>{m.name}</b>
                        {m.isLeader && <span className="pill mut" style={{ marginLeft: 6 }}>所属長</span>}
                      </td>
                      <td className="note">{m.team.name}</td>
                      <td>
                        {r ? <span className="pill ok">提出済</span> : <span className="pill bad">未提出</span>}
                      </td>
                      <td className={r ? `mark4 ${ratingClass[r.selfRating]}` : "note"}>
                        {r ? ratingMark[r.selfRating] : "―"}
                      </td>
                      <td className="note num">
                        {r?.submittedAt ? formatDateTime(r.submittedAt) : "―"}
                      </td>
                      <td>
                        {r ? (
                          r.confirmations.length > 0 ? (
                            <span className="pill good">確認済</span>
                          ) : m.id === user.id ? (
                            <span className="note">―</span>
                          ) : (
                            <span className="pill warn">未確認</span>
                          )
                        ) : (
                          <span className="note">―</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {r ? (
                          <Link href={`/reports/${r.id}`} className="btn sm">週報を開く</Link>
                        ) : skip ? null : (
                          <form action={sendReminder} style={{ display: "inline" }}>
                            <input type="hidden" name="week" value={toDateKey(weekStart)} />
                            <input type="hidden" name="userId" value={m.id.toString()} />
                            <button className="btn sm">リマインド</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ margin: "10px 0 0" }}>
            役員は週報の提出対象外のため一覧に含みません。
            「リマインド」は対象者にTeamsで通知します(Webhook設定時のみ送信されます)。
          </p>
        </div>
      </div>
    </>
  );
}
