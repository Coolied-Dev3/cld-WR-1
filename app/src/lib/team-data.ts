import { prisma } from "./prisma";
import type { CurrentUser } from "./auth";

/** 閲覧可能なチーム一覧(所属長=自分がリーダーのチーム、役員=全チーム) */
export async function getViewableTeams(user: CurrentUser) {
  if (user.role === "executive") {
    return prisma.team.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  }
  const leaderTeamIds = user.memberships.filter((m) => m.isLeader).map((m) => m.teamId);
  return prisma.team.findMany({ where: { id: { in: leaderTeamIds } }, orderBy: { id: "asc" } });
}

/** 指定チームの現メンバー(リーダー含む) */
export async function getTeamMembers(teamId: bigint) {
  const memberships = await prisma.teamMembership.findMany({
    where: { teamId, endDate: null, user: { isActive: true } },
    include: { user: true },
    orderBy: [{ isLeader: "desc" }, { userId: "asc" }],
  });
  return memberships.map((m) => ({ ...m.user, isLeader: m.isLeader }));
}
