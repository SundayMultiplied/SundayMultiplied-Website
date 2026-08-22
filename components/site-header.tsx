"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  ["Services", "/services"],
  ["Workshops", "/workshops"],
  ["Pricing", "/pricing"],
  ["Examples", "/examples"],
  ["About", "/about"],
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isDraftTwo = pathname.startsWith("/draft-2");
  const isHybrid = pathname.startsWith("/draft-hybrid");
  const reviewBase = isDraftTwo ? "/draft-2" : isHybrid ? "/draft-hybrid" : "";
  const activeLinks = reviewBase
    ? [
        ["Services", `${reviewBase}/services`],
        ["Workshops", `${reviewBase}/workshops`],
        ["Pricing", `${reviewBase}/pricing`],
        ["Examples", `${reviewBase}/examples`],
        ["About", `${reviewBase}/about`],
      ]
    : links;
  const homeHref = reviewBase || "/";
  const contactHref = `${reviewBase}/contact`;

  return (
    <header className={`site-header ${isDraftTwo ? "draft-two-header" : ""}`}>
      {isDraftTwo ? <a className="wordmark" href={homeHref} aria-label="Sunday Multiplied home" onClick={() => setOpen(false)}>
        <span className="mark" aria-hidden="true">S<span>×</span></span>
        <span>Sunday<br />Multiplied</span>
      </a> : <Link className="wordmark" href={homeHref} aria-label="Sunday Multiplied home" onClick={() => setOpen(false)}>
        <span className="mark" aria-hidden="true">S<span>×</span></span>
        <span>Sunday<br />Multiplied</span>
      </Link>}
      <nav className={open ? "nav-open" : ""} aria-label="Main navigation">
        {activeLinks.map(([label, href]) => isDraftTwo
          ? <a key={href} href={href} className={pathname === href ? "active" : ""} onClick={() => setOpen(false)}>{label}</a>
          : <Link key={href} href={href} className={pathname === href ? "active" : ""} onClick={() => setOpen(false)}>{label}</Link>)}
        {isDraftTwo ? <a className="mobile-contact" href={contactHref} onClick={() => setOpen(false)}>Start a conversation ↗</a> : <Link className="mobile-contact" href={contactHref} onClick={() => setOpen(false)}>Start a conversation ↗</Link>}
      </nav>
      {isDraftTwo ? <a className="button button-small" href={contactHref}>Start a conversation <span aria-hidden="true">↗</span></a> : <Link className="button button-small" href={contactHref}>Start a conversation <span aria-hidden="true">↗</span></Link>}
      <button className="menu-button" type="button" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span /><span />
      </button>
    </header>
  );
}
