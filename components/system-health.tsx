"use client";

import { useEffect, useState } from "react";

type Status = "operational" | "degraded" | "not_configured";
type HealthItem = { status: Status; label: string; detail: string };
type HealthResponse = {
  checkedAt: string;
  github: HealthItem & { latestPr?: { number: number; title: string; state: string; url: string; updatedAt?: string | null } | null };
  cloudflare: HealthItem & { deployment?: string | null; deploymentTimestamp?: string | null };
  brevo: HealthItem;
  youtubeListener: HealthItem;
  error?: string;
};

const LABELS: Record<Status, string> = { operational: "Operational", degraded: "Needs attention", not_configured: "Not configured" };

export function SystemHealth() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/system-health", { cache: "no-store" });
      const payload = await response.json() as HealthResponse;
      if (!response.ok) throw new Error(payload.error || "Unable to load system health.");
      setData(payload);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to load system health.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  if (loading) return <section className="admin-health"><div className="admin-health-head"><div><span>System check</span><h2>Checking connected services…</h2></div></div></section>;
  if (error || !data) return <section className="admin-health"><div className="admin-health-head"><div><span>System check</span><h2>Health check unavailable</h2><p>{error}</p></div><button type="button" onClick={() => void load()}>Retry</button></div></section>;

  const cards = [
    {
      name: "GitHub",
      item: data.github,
      extra: data.github.latestPr ? <a href={data.github.latestPr.url} target="_blank" rel="noreferrer">PR #{data.github.latestPr.number} · {data.github.latestPr.state}</a> : null,
    },
    {
      name: "Cloudflare",
      item: data.cloudflare,
      extra: data.cloudflare.deployment ? <span>Deployment {data.cloudflare.deployment.slice(0, 12)}</span> : <span>Deployment ID unavailable</span>,
    },
    { name: "Brevo", item: data.brevo, extra: null },
    { name: "YouTube Listener", item: data.youtubeListener, extra: <span>Future listener integration</span> },
  ];

  return <section className="admin-health">
    <div className="admin-health-head"><div><span>System check</span><h2>Connected services</h2><p>Live status for the systems that support Sunday Multiplied operations.</p></div><button type="button" onClick={() => void load()}>Refresh</button></div>
    <div className="admin-health-grid">
      {cards.map(({ name, item, extra }) => <article className={`admin-health-card health-${item.status}`} key={name}>
        <div className="admin-health-title"><strong>{name}</strong><span>{LABELS[item.status]}</span></div>
        <h3>{item.label}</h3>
        <p>{item.detail}</p>
        {extra && <div className="admin-health-meta">{extra}</div>}
      </article>)}
    </div>
    <small>Last checked {new Date(data.checkedAt).toLocaleString()}</small>
  </section>;
}
