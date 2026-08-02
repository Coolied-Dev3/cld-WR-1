import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getViewableTeams } from "@/lib/team-data";
import { weekLabel, formatDateTime } from "@/lib/week";
import { complianceLevelLabel } from "@/lib/labels";

export default async function CompliancePage(props: {
  searchParams: Promise<{ level?: string }>;
}) {
  const user = await requireUser(["manager", "executive"]);
  const { level } = await props.searchParams;
  const isExec = user.role === "executive";

  // 所属長は自事業室、かつ「所属長・役員に公開」の報告のみ閲覧できる
  const teams = isExec ? [] : await getViewableTeams(user);

  const reports = await prisma.complianceReport.findMany({
    where: {
      level: level === "concern" || level === "issue" ? level : { not: "none" },
      ...(isExec
        ? {}
        : {
            visibility: "manager_and_executive",
            report: { teamId: { in: teams.map((t) => t.id) } },
          }),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      report: { include: { user: true, team: true } },
      viewLogs: { orderBy: { viewedAt: "desc" }, take: 1, include: { viewer: true } },
    },
  });

  return (
    <>
      <h1 className="pg">
        モラル・ハラスメント報告一覧
        <small>{isExec ? "全社(役員のみ公開の報告を含む)" : "自事業室・所属長に公開された報告のみ"}</small>
      </h1>
      <div className="stack">
        <form className="card filterbar" method="get">
          <label>
            レベル
            <select name="level" defaultValue={level ?? ""}>
              <option value="">すべて</option>
              <option value="concern">気になる点あり</option>
              <option value="issue">問題あり</option>
            </select>
          </label>
          <button className="btn pri sm">表示</button>
        </form>
        <div className="card">
          <div className="tscroll">
            <table>
              <thead>
                <tr>
                  <th>週</th><th>報告者</th><th>事業室</th><th>レベル</th>
                  {isExec && <th>公開範囲</th>}
                  <th>最終閲覧</th><th></th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 && (
                  <tr><td colSpan={isExec ? 7 : 6} className="note">報告はありません。</td></tr>
                )}
                {reports.map((c) => (
                  <tr key={c.id.toString()}>
                    <td className="num">{weekLabel(c.report.weekStartDate)}</td>
                    <td>{c.report.user.name}</td>
                    <td>{c.report.team.name}</td>
                    <td>
                      <span className={`pill ${c.level === "concern" ? "warn" : "bad"}`}>
                        {complianceLevelLabel[c.level]}
                      </span>
                    </td>
                    {isExec && (
                      <td>
                        {c.visibility === "executive_only" ? (
                          <span className="pill mut">役員のみ</span>
                        ) : (
                          <span className="note">所属長・役員</span>
                        )}
                      </td>
                    )}
                    <td className="note">
                      {c.viewLogs[0]
                        ? `${c.viewLogs[0].viewer.name} ${formatDateTime(c.viewLogs[0].viewedAt)}`
                        : "未閲覧"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/reports/${c.reportId}`} className="btn sm">詳細</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note" style={{ margin: "10px 0 0" }}>
            詳細を開くと閲覧ログが記録されます。統計画面には件数のみが表示され、内容は表示されません。
            {!isExec && "本人が「役員のみに公開」を選んだ報告は、この一覧にも詳細にも表示されません。"}
          </p>
        </div>
      </div>
    </>
  );
}
