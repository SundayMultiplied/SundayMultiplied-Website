"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { usePathname } from "next/navigation";

type ReviewLinkProps = ComponentProps<typeof NextLink>;

export function ReviewLink({ href, ...props }: ReviewLinkProps) {
  const pathname = usePathname();
  const resolvedHref =
    pathname.startsWith("/draft-hybrid") &&
    typeof href === "string" &&
    href.startsWith("/") &&
    !href.startsWith("/draft-hybrid")
      ? `/draft-hybrid${href}`
      : href;

  return <NextLink href={resolvedHref} {...props} />;
}
