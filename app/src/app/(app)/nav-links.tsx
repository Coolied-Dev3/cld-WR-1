"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string } | { group: string };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item, i) =>
        "group" in item ? (
          <div key={i} className="grp">
            {item.group}
          </div>
        ) : (
          <Link
            key={i}
            href={item.href}
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
    </>
  );
}
