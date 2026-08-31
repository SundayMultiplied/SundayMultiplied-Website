"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Dashboard" },
  { href: "/production", label: "Production" },
  { href: "/approvals", label: "Approvals" },
  { href: "/revisions", label: "Revisions" },
  { href: "/onboarding", label: "Onboarding" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <header className="admin-nav-shell">
      <div className="admin-nav-brand">
        <Link href="/admin" className="admin-nav-home"><strong>Sunday Multiplied</strong><span>Admin</span></Link>
      </div>
      <nav className="admin-nav-links" aria-label="Admin navigation">
        {items.map((item) => <Link key={item.href} href={item.href} className={pathname === item.href ? "is-active" : ""}>{item.label}</Link>)}
      </nav>
    </header>
  );
}
