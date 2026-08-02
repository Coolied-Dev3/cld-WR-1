import { requireUser } from "@/lib/auth";
import { currentMonthKey, monthLabel } from "@/lib/week";
import {
  MonthPicker,
  ReportTimeline,
  resolveMonths,
  getMonthlyReports,
} from "@/components/report-timeline";

export default async function ReportHistoryPage(props: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser(["member", "manager"]);
  const { month } = await props.searchParams;

  const { months, selected } = await resolveMonths(user.id, month, currentMonthKey());
  const reports = await getMonthlyReports(user.id, selected);

  return (
    <>
      <h1 className="pg">
        過去の週報<small>{monthLabel(selected)}</small>
      </h1>
      <div className="stack">
        <div className="card">
          <MonthPicker action="/reports/history" months={months} selected={selected} />
        </div>
        <ReportTimeline
          reports={reports}
          monthKey={selected}
          viewer="owner"
          emptyMessage={`${monthLabel(selected)}に提出した週報はありません。`}
        />
      </div>
    </>
  );
}
