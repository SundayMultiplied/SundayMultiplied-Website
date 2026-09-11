"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./church-dashboard.module.css";
import { sortChurchHistory, type ChurchHistorySort } from "./dashboard-sorting";

type Resource = { id: string; packageId: string; kind: string; title: string; version: number; previewUrl: string | null; sortOrder: number; createdAt: string };
type PackageItem = { id: string; title: string; seriesTitle: string | null; weekOf: string; scripture: string | null; status: string; reviewerName: string | null; reviewerEmail: string | null; viewedAt: string | null; decidedAt: string | null; createdAt: string; updatedAt: string; resourceCount: number; resources: Resource[] };
type ActivityItem = { id: string; packageId: string; eventType: string; actorName: string | null; details: unknown; createdAt: string; packageTitle: string; weekOf: string };
type DashboardData = { church: { id: string; name: string; slug: string }; viewer: { email: string; isAdmin: boolean }; currentPackage: PackageItem | null; canReviewCurrent: boolean; packages: PackageItem[]; activity: ActivityItem[] };

const HISTORY_PAGE_SIZE = 10;
const ACTIVE_REVIEW_STATUSES = new Set(["ready_for_review", "viewed", "revised"]);

export function ChurchDashboard({ slug }: { slug: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySort, setHistorySort] = useState<ChurchHistorySort>("newest");
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/church-dashboard/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as DashboardData & { error?: string };
        if (!response.ok) throw new Error(body.error || "Unable to load this dashboard.");
        return body;
      })
      .then((body) => { if (!cancelled) setData(body); })
      .catch((failure: Error) => { if (!cancelled) setError(failure.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const sortedPackages = useMemo(() => sortChurchHistory(data?.packages || [], historySort), [data, historySort]);
  const totalResourceCount = useMemo(() => data?.packages.reduce((sum, item) => sum + item.resources.filter((resource) => Boolean(resource.previewUrl)).length, 0) || 0, [data]);
  const totalHistoryPages = Math.max(1, Math.ceil(sortedPackages.length / HISTORY_PAGE_SIZE));
  const pagedPackages = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return sortedPackages.slice(start, start + HISTORY_PAGE_SIZE);
  }, [sortedPackages, historyPage]);
  const historyStart = sortedPackages.length === 0 ? 0 : (historyPage - 1) * HISTORY_PAGE_SIZE + 1;
  const historyEnd = Math.min(historyPage * HISTORY_PAGE_SIZE, sortedPackages.length);

  useEffect(() => { setHistoryPage(1); }, [historySort]);
  useEffect(() => { if (historyPage > totalHistoryPages) setHistoryPage(totalHistoryPages); }, [historyPage, totalHistoryPages]);

  if (loading) return <main className={styles.shell}><div className={styles.stateCard} role="status">Loading your church portal…</div></main>;
  if (error || !data) return <main className={styles.shell}><div className={styles.stateCard}><strong>Dashboard unavailable</strong><p>{error || "No dashboard data was returned."}</p></div></main>;

  const current = data.currentPackage;
  const logoUrl = `/api/resource-assets/${encodeURIComponent(data.church.slug)}/logo`;
  const nextStep = current ? packageNextStep(current.status, data.canReviewCurrent) : null;
  const reviewLaunchUrl = `/api/church-dashboard/${encodeURIComponent(data.church.slug)}/review-current`;

  return (
    <main className={styles.shell}>
      <nav className={styles.portalNav} aria-label="Church portal navigation">
        <a className={styles.portalBrand} href="#dashboard">Sunday Multiplied</a>
        <div className={styles.portalLinks}><a href="#dashboard">Dashboard</a><a href="#resources">Resources</a><a href="#history">History</a></div>
      </nav>

      <header className={styles.hero} id="dashboard">
        <div className={styles.identity}>
          <div className={styles.logoFrame}>
            {!logoFailed ? <img src={logoUrl} alt={`${data.church.name} logo`} className={styles.churchLogo} onError={() => setLogoFailed(true)} /> : <span className={styles.logoFallback} aria-hidden="true">{churchInitials(data.church.name)}</span>}
          </div>
          <div>
            <p className={styles.kicker}>Church portal</p>
            <h1>{data.church.name}</h1>
            <div className={styles.viewer}><span>Signed in as</span><strong>{data.viewer.email}</strong></div>
            <p className={styles.subtitle}>Your sermon-based discipleship resources, approvals, and weekly history.</p>
          </div>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Dashboard summary">
        <div><span>Weeks available</span><strong>{data.packages.length}</strong></div>
        <div><span>Resources available</span><strong>{totalResourceCount}</strong></div>
        <div><span>Current status</span><strong className={styles.metricStatus}>{current ? formatStatus(current.status) : "Getting started"}</strong></div>
      </section>

      <section className={styles.grid} id="resources">
        <article className={`${styles.card} ${styles.currentCard}`}>
          <div className={styles.cardHeading}>
            <div><p className={styles.kicker}>This week</p><h2>Current Package</h2></div>
            {current && <span className={`${styles.status} ${statusClass(current.status, styles)}`}>{formatStatus(current.status)}</span>}
          </div>

          {!current ? (
            <div className={styles.welcomeEmpty}><strong>Your first weekly package will appear here.</strong><p>Once Sunday Multiplied prepares your first sermon-based resources, you’ll be able to open them here and return to past weeks from the history below.</p></div>
          ) : (
            <>
              <div className={styles.currentMeta}>
                <div><span>Week of</span><strong>{formatDate(current.weekOf)}</strong></div>
                {current.seriesTitle && <div><span>Series</span><strong>{current.seriesTitle}</strong></div>}
                {current.scripture && <div><span>Scripture</span><strong>{current.scripture}</strong></div>}
              </div>
              <h3>{current.title}</h3>
              <div className={styles.resourceButtons} aria-label="Current package resources">
                {current.resources.map((resource) => resource.previewUrl ? <a key={resource.id} href={resource.previewUrl} target="_blank" rel="noreferrer">Open {resource.title} ↗</a> : <span className={styles.unavailableResource} key={resource.id}>{resource.title} · Not available yet</span>)}
              </div>
              {nextStep && <div className={`${styles.nextStep} ${nextStep.tone === "attention" ? styles.nextStepAttention : ""}`}><strong>{nextStep.title}</strong><p>{nextStep.body}</p>{data.canReviewCurrent && ACTIVE_REVIEW_STATUSES.has(current.status) && <a className={styles.reviewLaunch} href={reviewLaunchUrl}>Review current package →</a>}</div>}
            </>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeading}><div><p className={styles.kicker}>Timeline</p><h2>Recent Activity</h2></div></div>
          <div className={styles.activityList}>
            {data.activity.length === 0 && <p className={styles.empty}>Activity will appear here as packages are reviewed and approved.</p>}
            {data.activity.slice(0, 8).map((item) => <div className={styles.activityItem} key={item.id}><span className={styles.activityDot} aria-hidden="true" /><div><strong>{activityLabel(item.eventType)}</strong><p>{item.packageTitle}{item.actorName ? ` · ${item.actorName}` : ""}</p><time>{formatDateTime(item.createdAt)}</time></div></div>)}
          </div>
        </article>
      </section>

      <section className={styles.card} id="history">
        <div className={styles.cardHeading}><div><p className={styles.kicker}>Archive</p><h2>Past Weeks & Resources</h2></div><div className={styles.historyControls}><label><span>Sort history</span><select value={historySort} onChange={(event) => setHistorySort(event.target.value as ChurchHistorySort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="series_asc">Series A–Z</option><option value="series_desc">Series Z–A</option></select></label><span className={styles.count}>{data.packages.length} weeks</span></div></div>
        {data.packages.length === 0 ? <div className={styles.welcomeEmpty}><strong>No history yet.</strong><p>Your completed weekly packages will collect here automatically.</p></div> : <>
          <div className={styles.desktopHistory}>
            <table className={styles.table}><thead><tr><th>Week</th><th>Series</th><th>Package</th><th>Status</th><th>Reviewer</th><th>Resources</th></tr></thead><tbody>{pagedPackages.map((item) => <tr key={item.id}><td>{formatDate(item.weekOf)}</td><td>{item.seriesTitle || <small>Not assigned</small>}</td><td><strong>{item.title}</strong></td><td><span className={`${styles.status} ${statusClass(item.status, styles)}`}>{formatStatus(item.status)}</span>{item.decidedAt && <small>{formatDate(item.decidedAt)}</small>}</td><td>{item.reviewerName || item.reviewerEmail || "—"}</td><td><div className={styles.archiveLinks}>{item.resources.map((resource) => resource.previewUrl ? <a key={resource.id} href={resource.previewUrl} target="_blank" rel="noreferrer">{resource.kind}</a> : <small key={resource.id}>{resource.kind} unavailable</small>)}</div></td></tr>)}</tbody></table>
          </div>
          <div className={styles.mobileHistory} aria-label="Past weeks and resources">{pagedPackages.map((item) => <article className={styles.historyCard} key={item.id}><div className={styles.historyCardHead}><div><small>{formatDate(item.weekOf)}</small><strong>{item.title}</strong></div><span className={`${styles.status} ${statusClass(item.status, styles)}`}>{formatStatus(item.status)}</span></div>{item.seriesTitle && <p><span>Series</span>{item.seriesTitle}</p>}{item.scripture && <p><span>Scripture</span>{item.scripture}</p>}<div className={styles.archiveLinks}>{item.resources.map((resource) => resource.previewUrl ? <a key={resource.id} href={resource.previewUrl} target="_blank" rel="noreferrer">{resource.kind}</a> : <small key={resource.id}>{resource.kind} unavailable</small>)}</div></article>)}</div>
          <div className={styles.pagination} aria-label="Approval history pagination"><span>Showing {historyStart}–{historyEnd} of {sortedPackages.length}</span>{totalHistoryPages > 1 && <button type="button" onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} disabled={historyPage === 1}>Previous</button>}{totalHistoryPages > 1 && <span>Page {historyPage} of {totalHistoryPages}</span>}{totalHistoryPages > 1 && <button type="button" onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))} disabled={historyPage === totalHistoryPages}>Next</button>}</div>
        </>}
      </section>
    </main>
  );
}

function formatStatus(value: string) {
  const labels: Record<string, string> = { approved: "Approved", revision_requested: "Changes requested", ready_for_review: "Ready to review", viewed: "Review in progress", revised: "Revised resources ready", sent_for_approval: "Awaiting approval" };
  return labels[value] || value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function packageNextStep(status: string, canReviewCurrent: boolean) {
  if (ACTIVE_REVIEW_STATUSES.has(status)) return { tone: "attention", title: canReviewCurrent ? "Your review is the next step" : "This package is ready for review", body: canReviewCurrent ? "Open the resources above, then launch the secure review here to approve them or request changes." : "The assigned reviewer can launch the secure review from their church dashboard or use the review link sent by email." };
  if (status === "sent_for_approval") return { tone: "attention", title: "Awaiting review", body: "The assigned reviewer can use the secure review link sent by email." };
  if (status === "revision_requested") return { tone: "neutral", title: "Changes are in progress", body: "Your requested changes have been received. Updated resources will appear here when they are ready." };
  if (status === "approved") return { tone: "neutral", title: "This package is approved", body: "These resources are ready to use. You can return to any previous week from the history below." };
  return null;
}

function formatDate(value: string) { const date = new Date(`${value.slice(0, 10)}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date); }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
function activityLabel(eventType: string) { const labels: Record<string, string> = { created: "Weekly package prepared", viewed: "Review opened", approved: "Resources approved", revision_requested: "Changes requested", notification_sent: "Follow-up sent", review_ready_notification_sent: "Review invitation sent" }; return labels[eventType] || formatStatus(eventType); }
function statusClass(status: string, sheet: Record<string, string>) { if (status === "approved") return sheet.approved || ""; if (status === "revision_requested") return sheet.revision || ""; if (["ready_for_review", "viewed", "revised", "sent_for_approval"].includes(status)) return sheet.pending || ""; return sheet.neutral || ""; }
function churchInitials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]?.toUpperCase() || "").join("") || "SM"; }
