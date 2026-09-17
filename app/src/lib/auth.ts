import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getSession } from "./session";
import type { Role } from "@prisma/client";

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: BigInt(session.userId) },
    include: {
      memberships: { where: { endDate: null }, include: { team: true } },
    },
  });
  if (!user || !user.isActive) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** ログイン必須。未ログインは/login、初回パスワード未変更は/passwordへ */
export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/password");
  if (roles && !roles.includes(user.role)) redirect("/");
  return user;
}

/** 所属長として管理しているチームID(役員は全チーム) */
export async function getManagedTeamIds(user: CurrentUser): Promise<bigint[]> {
  if (user.role === "executive") {
    const teams = await prisma.team.findMany({ where: { isActive: true } });
    return teams.map((t) => t.id);
  }
  if (user.role === "manager") {
    return user.memberships.filter((m) => m.isLeader).map((m) => m.teamId);
  }
  return [];
}

/**
 * 週報を閲覧できるか(本人 / 提出者が現在所属する事業室の所属長 / 役員)。
 * 2つの事業室に所属する人の週報は、どちらの事業室の所属長も閲覧できる。
 * 週報レコードの teamId(提出時の主所属)だけでなく、提出者の現所属で判定する。
 */
export async function canViewReport(
  user: CurrentUser,
  report: { userId: bigint; teamId: bigint }
): Promise<boolean> {
  if (report.userId === user.id) return true;
  if (user.role === "executive") return true;
  if (user.role === "manager") {
    const leaderTeamIds = user.memberships.filter((m) => m.isLeader).map((m) => m.teamId);
    if (leaderTeamIds.length === 0) return false;
    if (leaderTeamIds.includes(report.teamId)) return true;
    const n = await prisma.teamMembership.count({
      where: { userId: report.userId, endDate: null, teamId: { in: leaderTeamIds } },
    });
    return n > 0;
  }
  return false;
}

export async function logAudit(
  userId: bigint,
  action: string,
  targetType: string,
  targetId?: bigint,
  detail?: object
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      targetType,
      targetId: targetId ?? null,
      detail: detail ? JSON.parse(JSON.stringify(detail)) : undefined,
    },
  });
}
