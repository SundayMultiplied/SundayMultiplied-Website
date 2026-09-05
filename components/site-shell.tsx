"use client";

import { usePathname } from "next/navigation";
import { AdminNav } from "./admin-nav";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function SiteShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isPastoralReview = pathname.startsWith("/review/");
  const isComparisonReview = pathname.startsWith("/compare/");
  const isChurchPortal = pathname.startsWith("/church/");
  const adminRoots = ["/admin", "/production", "/approvals", "/revisions", "/onboarding", "/theme-editor"];
  const isAdminRoute = adminRoots.some((root) => pathname === root || pathname.startsWith(`${root}/`));

  if (isPastoralReview || isComparisonReview || isChurchPortal) return <>{children}</>;

  if (isAdminRoute) {
    return <><AdminNav />{children}</>;
  }

  return <><SiteHeader />{children}<SiteFooter /></>;
}
