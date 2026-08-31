"use client";

import { useEffect, useState } from "react";

type PackageSummary = {
  id: string; title: string; weekOf: string; status: string; updatedAt: string; churchName: string; resourceCount: number;
  reviewNotificationStatus: "sent" | "failed" | "skipped" | "not_attempted"; reviewNotificationMessage: string;
  decisionNotificationStatus: "sent" | "failed" | "skipped" | "not_attempted"; decisionNotificationMessage: string;
};
type PackagePagination = { page: number; pageSize: number; total: number; totalPages: number };

export function ApprovalPackagesDashboard() {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState<PackagePagination>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [error, setError] = useState("");
  const [showManualCreate, setShowManualCreate] = useState(false);
  const [createdLink, setCreatedLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [retryingId, setRetryingId] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  async function loadPackages(nextPage = page, nextPageSize = pageSize) {
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(nextPageSize), sort: "updatedAt", direction: "desc" });
    const response = await fetch(`/api/approval-packages?${params.toString()}`, { cache: "no-store" });
    const data = await response.json() as { error?: string; packages?: PackageSummary[]; pagination?: PackagePagination };
    if (!response.ok) throw new Error(data.error || "Unable to load approval packages.");
    setPackages(data.packages || []);
    if (data.pagination) { setPagination(data.pagination); setPage(data.pagination.page); setPageSize(data.pagination.pageSize); }
  }

  useEffect(() => { loadPackages(1, 10).catch((failure: Error) => setError(failure.message)); }, []);

  async function createPackage(formData: FormData) {
    setSaving(true); setError(""); setActionMessage("");
    const resources = ["Monday", "Group", "Family"].map((kind) => ({ kind, title: `${kind} Multiplied`, previewUrl: String(formData.get(`${kind.toLowerCase()}Url`) || "") })).filter((item) => item.previewUrl);
    const response = await fetch("/api/approvals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ churchName: formData.get("churchName"), title: formData.get("title"), seriesTitle: formData.get("seriesTitle"), weekOf: formData.get("weekOf"), scripture: formData.get("scripture"), resources }) });
    const data = await response.json() as { error?: string; reviewUrl?: string };
    setSaving(false);
    if (!response.ok) return setError(data.error || "Unable to create this package.");
    if (data.reviewUrl) setCreatedLink(data.reviewUrl);
    setActionMessage("Manual approval package created.");
    await loadPackages(1, pageSize);
  }

  async function retryNotification(item: PackageSummary) {
    if (!window.confirm(`Send another approval notification for ${item.churchName}: ${item.title}?`)) return;
    setRetryingId(item.id); setActionMessage("");
    const response = await fetch(`/api/approvals/${encodeURIComponent(item.id)}/notification`, { method: "POST" });
    const data = await response.json() as { error?: string; message?: string };
    setRetryingId(""); setActionMessage(data.message || data.error || (response.ok ? "Notification sent." : "Notification failed."));
    await loadPackages(page, pageSize);
  }

  return <main className="approval-dashboard">
    <div className="approval-dashboard-head"><div><p className="approval-kicker">Church review</p><h1>Approval Packages</h1><p>Track pastoral review status, notification history, approvals, and revision requests.</p></div><button type="button" className="approval-approve" onClick={() => setShowManualCreate((value) => !value)}>{showManualCreate ? "Close manual form" : "Manual package"}</button></div>
    {error && <div className="approval-admin-error"><strong>Approval history unavailable</strong><p>{error}</p></div>}
    {actionMessage && <div className="approval-notice" role="status">{actionMessage}</div>}
    {createdLink && <div className="approval-created-link"><strong>Secure review link</strong><input readOnly value={createdLink} onFocus={(event) => event.currentTarget.select()} /></div>}
    {showManualCreate && <form className="approval-create" action={(formData) => void createPackage(formData)}>
      <div className="approval-create-heading"><h2>Manual review package</h2><p>Fallback for resources created outside the production workflow.</p></div>
      <div className="approval-create-grid">
        <label>Church name<input name="churchName" required /></label><label>Week of<input name="weekOf" type="date" required /></label>
        <label>Package title<input name="title" required /></label><label>Series title<input name="seriesTitle" /></label>
        <label className="wide">Scripture<input name="scripture" /></label>
        <label>Monday resource URL<input name="mondayUrl" type="url" /></label><label>Group resource URL<input name="groupUrl" type="url" /></label><label>Family resource URL<input name="familyUrl" type="url" /></label>
      </div>
      <button className="approval-approve" disabled={saving}>{saving ? "Creating…" : "Create secure review"}</button>
    </form>}
    {!error && <>
      <p className="approval-kicker">{pagination.total} total packages</p>
      <div className="approval-table">
        <div className="approval-table-row approval-table-labels"><span>Church / Package</span><span>Week of</span><span>Resources</span><span>Status</span><span>Notification</span></div>
        {packages.map((item) => <div className="approval-table-row" key={item.id}>
          <span><strong>{item.churchName}</strong><small>{item.title}</small></span><span>{item.weekOf}</span><span>{item.resourceCount}</span><span className={`approval-status status-${item.status}`}>{item.status.replaceAll("_", " ")}</span>
          <span className="approval-notification">
            <span className="approval-notification-stage"><small>Review request</small><strong className={`notification-${item.reviewNotificationStatus}`}>{item.reviewNotificationStatus.replaceAll("_", " ")}</strong>{item.reviewNotificationMessage && <small>{item.reviewNotificationMessage}</small>}</span>
            <span className="approval-notification-stage"><small>Decision</small><strong className={`notification-${item.decisionNotificationStatus}`}>{item.decisionNotificationStatus.replaceAll("_", " ")}</strong>{item.decisionNotificationMessage && <small>{item.decisionNotificationMessage}</small>}{["approved", "revision_requested"].includes(item.status) && <button type="button" onClick={() => void retryNotification(item)} disabled={retryingId === item.id}>{retryingId === item.id ? "Sending…" : "Retry decision email"}</button>}</span>
          </span>
        </div>)}
      </div>
      <div className="approval-pagination" aria-label="Approval package pagination">
        <button type="button" disabled={pagination.page <= 1} onClick={() => void loadPackages(pagination.page - 1, pageSize)}>Previous</button>
        <span>Page {pagination.page} of {pagination.totalPages}</span>
        <label>Rows <select value={pageSize} onChange={(event) => void loadPackages(1, Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
        <button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => void loadPackages(pagination.page + 1, pageSize)}>Next</button>
      </div>
    </>}
  </main>;
}
