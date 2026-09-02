import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { NavProvider, MenuButton, SideNav, type NavItem } from "./nav-links";

const roleLabels: Record<string, string> = {
  member: "",
  manager: "所属長",
  executive: "役員",
  admin: "管理者",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const teamNames = user.memberships.map((m) => m.team.name).join("・");

  // 役員も週報を提出する(使用するマスタは役員用に切り替わる)
  const items: NavItem[] = [{ group: "週報" }, { href: "/", label: "ホーム" }];
  if (user.role !== "admin") {
    items.push(
      { href: "/reports/edit", label: "週報を書く" },
      { href: "/reports/history", label: "過去の週報" }
    );
  }
  if (user.role === "manager" || user.role === "executive") {
    items.push(
      { group: "管理" },
      { href: "/team/status", label: "提出状況" },
      { href: "/team/personal", label: "個人管理" },
      { href: "/team", label: "チーム管理" },
      { href: "/company/compliance", label: "モラル報告" },
      { href: "/team/dashboard", label: "ダッシュボード" }
    );
  }
  if (user.role === "executive") {
    items.push({ group: "監査" }, { href: "/company/audit", label: "監査ログ" });
  }
  if (user.role === "admin") {
    items.push(
      { group: "管理" },
      { href: "/admin/users", label: "ユーザー管理" },
      { href: "/admin/teams", label: "チーム管理" },
      { href: "/admin/masters", label: "マスタ管理" },
      { href: "/admin/weeks", label: "週・締切設定" },
      { href: "/admin/settings", label: "システム設定" },
      { href: "/admin/audit", label: "監査ログ" }
    );
  }

  return (
    <NavProvider>
      <header className="appbar">
        <MenuButton />
        <Link href="/" className="brand">
          <span className="mark">週</span>
          <span className="brand-name">クーリード 週報管理システム</span>
        </Link>
        <span className="sp" />
        <span className="who">
          <b>{user.name}</b>
          {teamNames ? `(${teamNames}${user.role === "manager" ? " 所属長" : ""})` : roleLabels[user.role] ? `(${roleLabels[user.role]})` : ""}
        </span>
        <form action={logout}>
          <button className="btn sm">ログアウト</button>
        </form>
      </header>
      <div className="shell-body">
        <SideNav items={items} />
        <main className="main">{children}</main>
      </div>
    </NavProvider>
  );
}
