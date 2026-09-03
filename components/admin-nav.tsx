"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Dashboard" },
  { href: "/production", label: "Production" },
  { href: "/approvals", label: "Approvals" },
  { href: "/revisions", label: "Revisions" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/theme-editor", label: "Theme Editor" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <header className="admin-nav-shell">
      <nav className="admin-nav-links" aria-label="Admin navigation">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
          return <Link key={item.href} href={item.href} className={active ? "is-active" : ""}>{item.label}</Link>;
        })}
      </nav>
    </header>
  );
}
