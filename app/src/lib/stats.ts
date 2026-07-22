import { prisma } from "./prisma";
import { lastNWeekStarts, toDateKey } from "./week";
import { ratingScore } from "./labels";
import type { SelfRating } from "@prisma/client";

export type DashboardStats = {
  weeks: Date[];
  reportCount: number;
  avgScore: number | null;
  submissionRate: number | null;
  distribution: Record<SelfRating, number>;
  weeklyAvg: { week: Date; avg: number | null }[];
  issueCounts: { name: string; count: number }[];
  cmCounts: { name: string; count: number }[];
  complianceCount: number;
  memberCount: number;
};

/** teamIds を絞ると該当チーム、空配列なら全チーム対象 */
export async function computeStats(teamIds: bigint[], numWeeks: number): Promise<DashboardStats> {
  const weeks = lastNWeekStarts(numWeeks).reverse(); // 古い順
  const teamFilter = teamIds.length > 0 ? { teamId: { in: teamIds } } : {};

  const [reports, skipWeeks, memberCount] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: {
        ...teamFilter,
        weekStartDate: { in: weeks },
        status: { not: "draft" },
      },
      include: {
        issues: { include: { issueCategory: { include: { parent: true } }, countermeasureCategory: { include: { parent: true } } } },
        compliance: true,
      },
    }),
    prisma.skipWeek.findMany({ where: { weekStartDate: { in: weeks } } }),
    prisma.teamMembership.count({
      where: {
        ...(teamIds.length > 0 ? { teamId: { in: teamIds } } : {}),
        endDate: null,
        user: { isActive: true },
      },
    }),
  ]);

  const skipKeys = new Set(skipWeeks.map((s) => toDateKey(s.weekStartDate)));
  const effectiveWeeks = weeks.filter((w) => !skipKeys.has(toDateKey(w)));

  const distribution: Record<SelfRating, number> = { excellent: 0, good: 0, fair: 0, poor: 0 };
  let scoreSum = 0;
  for (const r of reports) {
    distribution[r.selfRating]++;
    scoreSum += ratingScore[r.selfRating];
  }

  const weeklyAvg = weeks.map((week) => {
    const rs = reports.filter((r) => toDateKey(r.weekStartDate) === toDateKey(week));
    return {
      week,
      avg: rs.length ? rs.reduce((a, r) => a + ratingScore[r.selfRating], 0) / rs.length : null,
    };
  });

  const countBy = (getName: (r: (typeof reports)[number]["issues"][number]) => string | null) => {
    const map = new Map<string, number>();
    for (const r of reports)
      for (const it of r.issues) {
        const name = getName(it);
        if (name) map.set(name, (map.get(name) ?? 0) + 1);
      }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  };

  return {
    weeks,
    reportCount: reports.length,
    avgScore: reports.length ? scoreSum / reports.length : null,
    submissionRate:
      effectiveWeeks.length && memberCount
        ? reports.length / (effectiveWeeks.length * memberCount)
        : null,
    distribution,
    weeklyAvg,
    issueCounts: countBy((it) => it.issueCategory.parent?.name ?? it.issueCategory.name),
    cmCounts: countBy((it) =>
      it.countermeasureCategory ? it.countermeasureCategory.parent?.name ?? it.countermeasureCategory.name : null
    ),
    complianceCount: reports.filter((r) => r.compliance && r.compliance.level !== "none").length,
    memberCount,
  };
}
