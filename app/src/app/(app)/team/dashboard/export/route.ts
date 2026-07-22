import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeStats } from "@/lib/stats";
import { toDateKey } from "@/lib/week";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "executive") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const teamParam = req.nextUrl.searchParams.get("team") ?? "all";
  const numWeeks = req.nextUrl.searchParams.get("weeks") === "26" ? 26 : 12;

  const teams =
    teamParam === "all"
      ? await prisma.team.findMany({ where: { isActive: true }, orderBy: { id: "asc" } })
      : await prisma.team.findMany({ where: { id: BigInt(teamParam) } });

  const lines: string[] = ["チーム,人数,平均評価,提出率(%),◎,○,△,✕,課題件数,モラル報告件数"];
  for (const t of teams) {
    const s = await computeStats([t.id], numWeeks);
    lines.push(
      [
        t.name,
        s.memberCount,
        s.avgScore !== null ? s.avgScore.toFixed(2) : "",
        s.submissionRate !== null ? Math.round(s.submissionRate * 100) : "",
        s.distribution.excellent,
        s.distribution.good,
        s.distribution.fair,
        s.distribution.poor,
        s.issueCounts.reduce((a, c) => a + c.count, 0),
        s.complianceCount,
      ].join(",")
    );
  }

  const all = await computeStats([], numWeeks);
  lines.push(
    [
      "全社",
      all.memberCount,
      all.avgScore !== null ? all.avgScore.toFixed(2) : "",
      all.submissionRate !== null ? Math.round(all.submissionRate * 100) : "",
      all.distribution.excellent,
      all.distribution.good,
      all.distribution.fair,
      all.distribution.poor,
      all.issueCounts.reduce((a, c) => a + c.count, 0),
      all.complianceCount,
    ].join(",")
  );

  const csv = "﻿" + lines.join("\r\n"); // BOM付き(Excel用)
  const today = toDateKey(new Date());
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dashboard_${today}.csv"`,
    },
  });
}
