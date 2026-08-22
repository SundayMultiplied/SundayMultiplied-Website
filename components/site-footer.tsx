"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteFooter() {
  const isDraftTwo = usePathname().startsWith("/draft-2");
  const base = isDraftTwo ? "/draft-2" : "";
  return (
    <footer className={isDraftTwo ? "draft-two-footer" : ""}>
      <div className="footer-wordmark">Sunday <em>Multiplied</em></div>
      <p>Helping churches steward the days between Sundays.</p>
      <div className="footer-links">
        {isDraftTwo ? <><a href={`${base}/services`}>Services</a><a href={`${base}/workshops`}>Workshops</a><a href={`${base}/pricing`}>Pricing</a><a href={`${base}/examples`}>Examples</a><a href={`${base}/about`}>About</a><a href={`${base}/contact`}>Contact</a></> : <><Link href="/services">Services</Link><Link href="/workshops">Workshops</Link><Link href="/pricing">Pricing</Link><Link href="/examples">Examples</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link></>}
      </div>
      <a href="mailto:hello@sundaymultiplied.com">hello@sundaymultiplied.com</a>
    </footer>
  );
}
