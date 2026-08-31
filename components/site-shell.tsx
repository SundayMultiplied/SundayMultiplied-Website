"use client";

import { usePathname } from "next/navigation";
import { AdminNav } from "./admin-nav";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function SiteShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isPastoralReview = pathname.startsWith("/review/");
  const isAdminRoute = pathname === "/admin" || pathname === "/approvals" || pathname === "/revisions";

  if (isPastoralReview) return <>{children}</>;

  if (isAdminRoute) {
    return (
      <>
        <AdminNav />
        {children}
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
