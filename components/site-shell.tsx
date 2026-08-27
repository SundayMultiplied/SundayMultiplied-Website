"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function SiteShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isOperationsRoute = pathname === "/approvals" || pathname.startsWith("/review/");

  if (isOperationsRoute) return <>{children}</>;

  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
