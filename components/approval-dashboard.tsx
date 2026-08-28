"use client";

import { useEffect, useState } from "react";

type PackageSummary = {
  id: string;
  title: string;
  weekOf: string;
  status: string;
  updatedAt: string;
  churchName: string;
  resourceCount: number;
  reviewNotificationStatus: "sent" | "failed" | "skipped" | "not_attempted";
  reviewNotificationMessage: string;
  reviewNotificationUpdatedAt?: string;
  decisionNotificationStatus: "sent" | "failed" | "skipped" | "not_attempted";
  decisionNotificationMessage: string;
  decisionNotificationUpdatedAt?: string;
};

export function ApprovalDashboard() {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createdLink, setCreatedLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [retryingId, setRetryingId] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  async function loadPackages() {
    const response = await fetch("/api/approvals", { cache: "no-store" });
    const data = await response.json() as { error?: string; packages: PackageSummary[] };
    if (!response.ok) throw new Error(data.error || "Unable to load approval packages.");
    setPackages(data.packages);
  }
  useEffect(() => {
    fetch("/api/approvals", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { error?: string; packages: PackageSummary[] };
        if (!response.ok) throw new Error(data.error || "Unable to load approval packages.");
        setPackages(data.packages);
      })
      .catch((failure: Error) => setError(failure.message));
  }, []);
  async function createPackage(formData: FormData) {
    setSaving(true);
    setError("");
    const resources = ["Monday", "Group", "Family"].map((kind) => ({
      kind,
      title: `${kind} Multiplied`,
      previewUrl: String(formData.get(`${kind.toLowerCase()}Url`) || ""),
    })).filter((item) => item.previewUrl);
    const response = await fetch("/api/approvals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        churchName: formData.get("churchName"), title: formData.get("title"), seriesTitle: formData.get("seriesTitle"),
        weekOf: formData.get("weekOf"), scripture: formData.get("scripture"), resources,
      }),
    });
    const data = await response.json() as { error?: string; reviewUrl?: string };
    setSaving(false);
    if (!response.ok) return setError(data.error || "Unable to create this package.");
    if (data.reviewUrl) setCreatedLink(data.reviewUrl);
    await loadPackages();
  }
  async function retryNotification(item: PackageSummary) {
    if (!window.confirm(`Send another approval notification for ${item.churchName}: ${item.title}?`)) return;
    setRetryingId(item.id);
    setActionMessage("");
    const response = await fetch(`/api/approvals/${encodeURIComponent(item.id)}/notification`, { method: "POST" });
    const data = await response.json() as { error?: string; status?: string; message?: string };
    setRetryingId("");
    setActionMessage(data.message || data.error || (response.ok ? "Notification sent." : "Notification failed."));
    await loadPackages();
  }
  return (
    <main className="approval-dashboard">
      <div className="approval-dashboard-head"><div><p className="approval-kicker">Sunday Multiplied operations</p><h1>Approval packages</h1></div><button type="button" className="approval-approve" onClick={() => setShowCreate((value) => !value)}>{showCreate ? "Close" : "Create package"}</button></div>
      {showCreate && <form className="approval-create" action={(formData) => void createPackage(formData)}>
        <div className="approval-create-heading"><h2>New review package</h2><p>Create the secure review link after the final HTML or PDF URLs are ready.</p></div>
        <div className="approval-create-grid">
          <label>Church name<input name="churchName" required /></label><label>Week of<input name="weekOf" type="date" required /></label>
          <label>Package title<input name="title" required /></label><label>Series title<input name="seriesTitle" /></label>
          <label className="wide">Scripture<input name="scripture" /></label>
          <label>Monday resource URL<input name="mondayUrl" type="url" /></label><label>Group resource URL<input name="groupUrl" type="url" /></label><label>Family resource URL<input name="familyUrl" type="url" /></label>
        </div>
        <button className="approval-approve" disabled={saving}>{saving ? "Creating…" : "Create secure review"}</button>
        {createdLink && <div className="approval-created-link"><strong>Secure review link</strong><input readOnly value={createdLink} onFocus={(event) => event.currentTarget.select()} /><small>Copy this link now. Only its secure hash is stored.</small></div>}
      </form>}
      {error && <div className="approval-admin-error"><strong>Dashboard access unavailable</strong><p>{error}</p></div>}
      {actionMessage && <div className="approval-notice" role="status">{actionMessage}</div>}
      {!error && <div className="approval-table">
        <div className="approval-table-row approval-table-labels"><span>Church / Package</span><span>Week of</span><span>Resources</span><span>Status</span><span>Notification</span></div>
        {packages.map((item) => <div className="approval-table-row" key={item.id}>
          <span><strong>{item.churchName}</strong><small>{item.title}</small></span><span>{item.weekOf}</span><span>{item.resourceCount}</span><span className={`approval-status status-${item.status}`}>{item.status.replaceAll("_", " ")}</span>
          <span className="approval-notification">
            <span className="approval-notification-stage"><small>Review request</small><strong className={`notification-${item.reviewNotificationStatus}`}>{item.reviewNotificationStatus.replaceAll("_", " ")}</strong>{item.reviewNotificationMessage && <small>{item.reviewNotificationMessage}</small>}</span>
            <span className="approval-notification-stage"><small>Decision</small><strong className={`notification-${item.decisionNotificationStatus}`}>{item.decisionNotificationStatus.replaceAll("_", " ")}</strong>{item.decisionNotificationMessage && <small>{item.decisionNotificationMessage}</small>}{["approved", "revision_requested"].includes(item.status) && <button type="button" onClick={() => void retryNotification(item)} disabled={retryingId === item.id}>{retryingId === item.id ? "Sending…" : "Retry decision email"}</button>}</span>
          </span>
        </div>)}
      </div>}
    </main>
  );
}
