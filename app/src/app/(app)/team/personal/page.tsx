import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getViewableMembers } from "@/lib/team-data";
import { currentMonthKey, monthLabel } from "@/lib/week";
import {
  MonthPicker,
  ReportTimeline,
  resolveMonths,
  getMonthlyReports,
} from "@/components/report-timeline";

export default async function PersonalReportsPage(props: {
  searchParams: Promise<{ user?: string; month?: string }>;
}) {
  const viewer = await requireUser(["manager", "executive"]);
  const { user: userParam, month } = await props.searchParams;

  // 閲覧できる範囲(所属長=自事業室 / 役員=全社)のメンバーから選ぶ
  const members = await getViewableMembers(viewer);
  if (members.length === 0) redirect("/");

  const target = members.find((m) => m.id.toString() === userParam) ?? members[0];
  const { months, selected } = await resolveMonths(target.id, month, currentMonthKey());
  const reports = await getMonthlyReports(target.id, selected);

  return (
    <>
      <h1 className="pg">
        個人週報
        <small>
          {target.name}({target.team.name}) · {monthLabel(selected)}
        </small>
      </h1>
      <div className="stack">
        <div className="card filterbar">
          {/* 対象者を変えたときは月の指定を引き継がない(その人の直近月を表示する) */}
          <form method="get" action="/team/personal" className="filterbar">
            <label>
              対象者
              <select name="user" defaultValue={target.id.toString()}>
                {members.map((m) => (
                  <option key={m.id.toString()} value={m.id.toString()}>
                    {m.team.name} / {m.name}
                    {m.isLeader ? "(所属長)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn sm">表示</button>
          </form>
          <span style={{ width: 1, height: 24, background: "var(--line)" }} />
          <MonthPicker
            action="/team/personal"
            months={months}
            selected={selected}
            extra={{ user: target.id.toString() }}
          />
        </div>

        <ReportTimeline
          reports={reports}
          monthKey={selected}
          viewer={viewer.role === "executive" ? "executive" : "manager"}
          emptyMessage={`${target.name} さんの${monthLabel(selected)}の週報はありません。`}
        />
      </div>
    </>
  );
}
