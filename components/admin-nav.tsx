"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Dashboard" },
  { href: "/approvals", label: "Resource Production" },
  { href: "/revisions", label: "Revisions" },
  { href: "/approvals#approval-packages", label: "Approval Packages" },
  { href: "/onboarding", label: "Church Onboarding" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <header className="admin-nav-shell">
      <div className="admin-nav-brand">
        <Link href="/admin" className="admin-nav-home"><strong>Sunday Multiplied</strong><span>Admin</span></Link>
      </div>
      <nav className="admin-nav-links" aria-label="Admin navigation">
        {items.map((item) => {
          const pathOnly = item.href.split("#")[0];
          const active = pathname === pathOnly && !item.href.includes("#");
          return <Link key={item.href} href={item.href} className={active ? "is-active" : ""}>{item.label}</Link>;
        })}
      </nav>
    </header>
  );
}
