import { prisma } from "./prisma";
import type { CurrentUser } from "./auth";
import type { Role } from "@prisma/client";

/**
 * 週報の提出対象ロール。
 * 役員(executive)は週報を提出せず確認する側、管理者(admin)は保守用のため対象外。
 * 一覧・提出状況・統計・リマインダー通知はすべてこの範囲で扱う。
 */
export const REPORTING_ROLES: Role[] = ["member", "manager"];

/** 提出対象者に絞り込むための where 条件(User向け) */
export const reportingUserWhere = {
  isActive: true,
  role: { in: REPORTING_ROLES },
} as const;

/** 閲覧可能なチーム一覧(所属長=自分がリーダーのチーム、役員=全チーム) */
export async function getViewableTeams(user: CurrentUser) {
  const where =
    user.role === "executive"
      ? { isActive: true }
      : { id: { in: user.memberships.filter((m) => m.isLeader).map((m) => m.teamId) } };

  const teams = await prisma.team.findMany({
    where: {
      ...where,
      // 提出対象者が1人もいない事業室(役員のみの事業室など)は表示しない
      memberships: { some: { endDate: null, user: reportingUserWhere } },
    },
    orderBy: { id: "asc" },
  });
  return teams;
}

/** 指定チームの現メンバー(提出対象者のみ。所属長を含む) */
export async function getTeamMembers(teamId: bigint) {
  const memberships = await prisma.teamMembership.findMany({
    where: { teamId, endDate: null, user: reportingUserWhere },
    include: { user: true },
    orderBy: [{ isLeader: "desc" }, { userId: "asc" }],
  });
  return memberships.map((m) => ({ ...m.user, isLeader: m.isLeader }));
}

/** 閲覧可能な全提出対象者(所属長=自チーム、役員=全社)を事業室順で返す */
export async function getViewableMembers(user: CurrentUser) {
  const teams = await getViewableTeams(user);
  const teamIds = teams.map((t) => t.id);
  const memberships = await prisma.teamMembership.findMany({
    where: { teamId: { in: teamIds }, endDate: null, user: reportingUserWhere },
    include: { user: true, team: true },
    orderBy: [{ teamId: "asc" }, { isLeader: "desc" }, { userId: "asc" }],
  });
  return memberships.map((m) => ({
    ...m.user,
    isLeader: m.isLeader,
    team: m.team,
  }));
}
