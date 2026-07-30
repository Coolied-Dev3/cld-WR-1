import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { NavLinks, type NavItem } from "./nav-links";

const roleLabels: Record<string, string> = {
  member: "",
  manager: "所属長",
  executive: "役員",
  admin: "管理者",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const teamNames = user.memberships.map((m) => m.team.name).join("・");

  // 役員は週報を提出しない(確認する側)ため「週報を書く」は表示しない
  const items: NavItem[] = [{ group: "週報" }, { href: "/", label: "ホーム" }];
  if (user.role === "member" || user.role === "manager") {
    items.push({ href: "/reports/edit", label: "週報を書く" });
  }
  if (user.role === "manager" || user.role === "executive") {
    items.push(
      { group: user.role === "executive" ? "全社" : "チーム" },
      { href: "/team", label: "チーム週報" },
      { href: "/team/status", label: "提出状況" },
      { href: "/team/dashboard", label: "ダッシュボード" }
    );
  }
  if (user.role === "executive") {
    items.push(
      { href: "/company/compliance", label: "モラル報告" },
      { group: "監査" },
      { href: "/company/audit", label: "監査ログ" }
    );
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
    <>
      <header className="appbar">
        <Link href="/" className="brand">
          <span className="mark">週</span>週報管理システム
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
        <nav className="nav">
          <NavLinks items={items} />
        </nav>
        <main className="main">{children}</main>
      </div>
    </>
  );
}
