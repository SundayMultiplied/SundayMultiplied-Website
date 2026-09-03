"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./church-dashboard.module.css";

type Resource = {
  id: string;
  packageId: string;
  kind: string;
  title: string;
  version: number;
  previewUrl: string | null;
  sortOrder: number;
  createdAt: string;
};

type PackageItem = {
  id: string;
  title: string;
  seriesTitle: string | null;
  weekOf: string;
  scripture: string | null;
  status: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  viewedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resourceCount: number;
  resources: Resource[];
};

type ActivityItem = {
  id: string;
  packageId: string;
  eventType: string;
  actorName: string | null;
  details: unknown;
  createdAt: string;
  packageTitle: string;
  weekOf: string;
};

type DashboardData = {
  church: { id: string; name: string; slug: string };
  viewer: { email: string; isAdmin: boolean };
  currentPackage: PackageItem | null;
  packages: PackageItem[];
  activity: ActivityItem[];
};

export function ChurchDashboard({ slug }: { slug: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/church-dashboard/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as DashboardData & { error?: string };
        if (!response.ok) throw new Error(body.error || "Unable to load this dashboard.");
        return body;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((failure: Error) => {
        if (!cancelled) setError(failure.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [slug]);

  const approvedCount = useMemo(
    () => data?.packages.filter((item) => item.status === "approved").length || 0,
    [data],
  );

  if (loading) {
    return <main className={styles.shell}><div className={styles.stateCard}>Loading church dashboard…</div></main>;
  }

  if (error || !data) {
    return <main className={styles.shell}><div className={styles.stateCard}><strong>Dashboard unavailable</strong><p>{error || "No dashboard data was returned."}</p></div></main>;
  }

  const current = data.currentPackage;

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>Sunday Multiplied</p>
          <h1>{data.church.name}</h1>
          <p className={styles.subtitle}>Your sermon-based discipleship resources, approvals, and weekly history.</p>
        </div>
        <div className={styles.viewer}>
          <span>Signed in as</span>
          <strong>{data.viewer.email}</strong>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Dashboard summary">
        <div><span>Total packages</span><strong>{data.packages.length}</strong></div>
        <div><span>Approved</span><strong>{approvedCount}</strong></div>
        <div><span>Current status</span><strong className={styles.metricStatus}>{current ? formatStatus(current.status) : "No package yet"}</strong></div>
      </section>

      <section className={styles.grid}>
        <article className={`${styles.card} ${styles.currentCard}`}>
          <div className={styles.cardHeading}>
            <div><p className={styles.kicker}>This week</p><h2>Current Package</h2></div>
            {current && <span className={`${styles.status} ${statusClass(current.status, styles)}`}>{formatStatus(current.status)}</span>}
          </div>

          {!current ? (
            <p className={styles.empty}>No approval packages have been created for this church yet.</p>
          ) : (
            <>
              <div className={styles.currentMeta}>
                <div><span>Week of</span><strong>{formatDate(current.weekOf)}</strong></div>
                {current.seriesTitle && <div><span>Series</span><strong>{current.seriesTitle}</strong></div>}
                {current.scripture && <div><span>Scripture</span><strong>{current.scripture}</strong></div>}
              </div>
              <h3>{current.title}</h3>
              <div className={styles.resourceButtons}>
                {current.resources.map((resource) => resource.previewUrl ? (
                  <a key={resource.id} href={resource.previewUrl} target="_blank" rel="noreferrer">
                    Open {resource.title} ↗
                  </a>
                ) : (
                  <span key={resource.id}>{resource.title}</span>
                ))}
              </div>
              {!["approved", "revision_requested"].includes(current.status) && (
                <p className={styles.reviewNote}>Approval decisions still use the secure review link sent by email. This dashboard intentionally does not expose or recreate that private token.</p>
              )}
            </>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeading}><div><p className={styles.kicker}>Timeline</p><h2>Recent Activity</h2></div></div>
          <div className={styles.activityList}>
            {data.activity.length === 0 && <p className={styles.empty}>No activity has been recorded yet.</p>}
            {data.activity.slice(0, 8).map((item) => (
              <div className={styles.activityItem} key={item.id}>
                <span className={styles.activityDot} aria-hidden="true" />
                <div>
                  <strong>{activityLabel(item.eventType)}</strong>
                  <p>{item.packageTitle}{item.actorName ? ` · ${item.actorName}` : ""}</p>
                  <time>{formatDateTime(item.createdAt)}</time>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeading}><div><p className={styles.kicker}>Archive</p><h2>Approval History & Resources</h2></div><span className={styles.count}>{data.packages.length} packages</span></div>
        {data.packages.length === 0 ? <p className={styles.empty}>Your history will appear here once the first package is created.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Week</th><th>Package</th><th>Status</th><th>Reviewer</th><th>Resources</th></tr></thead>
              <tbody>
                {data.packages.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.weekOf)}</td>
                    <td><strong>{item.title}</strong>{item.seriesTitle && <small>{item.seriesTitle}</small>}</td>
                    <td><span className={`${styles.status} ${statusClass(item.status, styles)}`}>{formatStatus(item.status)}</span>{item.decidedAt && <small>{formatDate(item.decidedAt)}</small>}</td>
                    <td>{item.reviewerName || item.reviewerEmail || "—"}</td>
                    <td><div className={styles.archiveLinks}>{item.resources.map((resource) => resource.previewUrl ? <a key={resource.id} href={resource.previewUrl} target="_blank" rel="noreferrer">{resource.kind}</a> : <span key={resource.id}>{resource.kind}</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function activityLabel(eventType: string) {
  const labels: Record<string, string> = {
    created: "Package created",
    viewed: "Review opened",
    approved: "Package approved",
    revision_requested: "Changes requested",
    notification_sent: "Decision email sent",
    review_ready_notification_sent: "Review email sent",
  };
  return labels[eventType] || formatStatus(eventType);
}

function statusClass(status: string, sheet: Record<string, string>) {
  if (status === "approved") return sheet.approved || "";
  if (status === "revision_requested") return sheet.revision || "";
  if (["ready_for_review", "sent_for_approval"].includes(status)) return sheet.pending || "";
  return sheet.neutral || "";
}
