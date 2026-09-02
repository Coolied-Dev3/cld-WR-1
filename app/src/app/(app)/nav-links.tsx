"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

export type NavItem = { href: string; label: string } | { group: string };

/**
 * サイドメニューの開閉状態。
 * スマホではヘッダーのボタンで開閉するドロワーになり、
 * PC(760px超)では常に表示される。
 */
const NavOpenContext = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 画面を移動したらメニューを閉じる
  useEffect(() => setOpen(false), [pathname]);

  // ドロワーを開いている間は背面をスクロールさせない
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Escキーで閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return <NavOpenContext.Provider value={{ open, setOpen }}>{children}</NavOpenContext.Provider>;
}

/** ヘッダーに置く開閉ボタン(スマホでのみ表示) */
export function MenuButton() {
  const { open, setOpen } = useContext(NavOpenContext);
  return (
    <button
      type="button"
      className="menu-toggle"
      aria-label={open ? "メニューを閉じる" : "メニューを開く"}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      <span className="menu-icon" aria-hidden="true">
        <span /><span /><span />
      </span>
    </button>
  );
}

/** サイドメニュー本体。スマホではドロワーとして左からスライドする */
export function SideNav({ items }: { items: NavItem[] }) {
  const { open, setOpen } = useContext(NavOpenContext);
  const pathname = usePathname();

  return (
    <>
      {open && <div className="nav-overlay" onClick={() => setOpen(false)} aria-hidden="true" />}
      <nav className={`nav${open ? " open" : ""}`} aria-label="メインメニュー">
        {items.map((item, i) =>
          "group" in item ? (
            <div key={i} className="grp">
              {item.group}
            </div>
          ) : (
            <Link
              key={i}
              href={item.href}
              onClick={() => setOpen(false)}
              className={
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href + "/"))
                  ? "on"
                  : ""
              }
            >
              {item.label}
            </Link>
          )
        )}
      </nav>
    </>
  );
}
