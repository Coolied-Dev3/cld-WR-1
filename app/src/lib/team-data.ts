import { prisma } from "./prisma";
import type { CurrentUser } from "./auth";
import type { Role } from "@prisma/client";

/**
 * 週報の提出対象ロール。
 * 役員も週報を提出する(使用するマスタは役員用に切り替わる)。
 * 管理者(admin)は保守用のため対象外。
 * 一覧・提出状況・統計・リマインダー通知はすべてこの範囲で扱う。
 */
export const REPORTING_ROLES: Role[] = ["member", "manager", "executive"];

/** 1人が同時に所属できる事業室の上限 */
export const MAX_TEAMS_PER_USER = 2;

/** そのロールが使う課題・対策マスタの適用範囲 */
export function masterScopeFor(role: Role): "general" | "executive" {
  return role === "executive" ? "executive" : "general";
}

/** 提出対象者に絞り込むための where 条件(User向け) */
export const reportingUserWhere = {
  isActive: true,
  role: { in: REPORTING_ROLES },
} as const;

/**
 * 週報の主所属(週報レコードに記録する事業室)。
 * 2つの事業室に所属している場合は、先に登録された所属を主所属とする。
 */
export function primaryMembership<T extends { id: bigint }>(memberships: T[]): T | undefined {
  return [...memberships].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/**
 * 「その事業室の週報」を絞り込む where 条件(WeeklyReport向け)。
 * 週報レコードには主所属の事業室しか記録されないため、
 * 「提出者が現在その事業室に所属している」週報も含める。
 * これにより2つの事業室に所属する人の週報が、どちらの事業室からも見える。
 */
export function reportTeamWhere(teamIds: bigint[]) {
  if (teamIds.length === 0) return {};
  return {
    OR: [
      { teamId: { in: teamIds } },
      { user: { memberships: { some: { teamId: { in: teamIds }, endDate: null } } } },
    ],
  };
}

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

/**
 * 閲覧可能な全提出対象者(所属長=自チーム、役員=全社)を事業室順で返す。
 * 2つの事業室に所属する人も1行にまとめ、teamNames に所属をすべて載せる。
 */
export async function getViewableMembers(user: CurrentUser) {
  const teams = await getViewableTeams(user);
  const teamIds = teams.map((t) => t.id);
  const memberships = await prisma.teamMembership.findMany({
    where: { teamId: { in: teamIds }, endDate: null, user: reportingUserWhere },
    include: { user: true, team: true },
    orderBy: [{ teamId: "asc" }, { isLeader: "desc" }, { userId: "asc" }],
  });

  type Row = (typeof memberships)[number]["user"] & {
    isLeader: boolean;
    team: (typeof memberships)[number]["team"];
    teamNames: string;
  };
  const rows: Row[] = [];
  const seen = new Map<string, Row>();
  for (const m of memberships) {
    const key = m.userId.toString();
    const existing = seen.get(key);
    if (existing) {
      existing.teamNames += `・${m.team.name}`;
      existing.isLeader = existing.isLeader || m.isLeader;
      continue;
    }
    const row: Row = { ...m.user, isLeader: m.isLeader, team: m.team, teamNames: m.team.name };
    seen.set(key, row);
    rows.push(row);
  }
  return rows;
}
