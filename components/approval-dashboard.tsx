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

type ChurchConfig = {
  slug: string;
  name: string;
  resources: string[];
  cssUrl: string;
  logoUrl?: string;
};

type ProductionJob = {
  id: string;
  churchSlug: string;
  churchName: string;
  weekOf: string;
  createdAt: string;
  status: "ready_for_internal_review" | "sent_for_approval";
  sourceFilename: string;
  metadata: {
    sermonTitle: string;
    seriesTitle: string;
    scripture: string;
    speaker: string;
    confidence: "high" | "medium" | "low";
  };
  resources: Array<{ kind: string; title: string; previewUrl: string }>;
  reviewUrl?: string;
};

export function ApprovalDashboard() {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [churches, setChurches] = useState<ChurchConfig[]>([]);
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [error, setError] = useState("");
  const [showManualCreate, setShowManualCreate] = useState(false);
  const [createdLink, setCreatedLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState("");
  const [retryingId, setRetryingId] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  async function loadPackages() {
    const response = await fetch("/api/approvals", { cache: "no-store" });
    const data = await response.json() as { error?: string; packages: PackageSummary[] };
    if (!response.ok) throw new Error(data.error || "Unable to load approval packages.");
    setPackages(data.packages);
  }

  async function loadProduction() {
    const [churchResponse, jobsResponse] = await Promise.all([
      fetch("/api/production/churches", { cache: "no-store" }),
      fetch("/api/production/jobs", { cache: "no-store" }),
    ]);
    const churchData = await churchResponse.json() as { error?: string; churches?: ChurchConfig[] };
    const jobsData = await jobsResponse.json() as { error?: string; jobs?: ProductionJob[] };
    if (!churchResponse.ok) throw new Error(churchData.error || "Unable to load configured churches.");
    if (!jobsResponse.ok) throw new Error(jobsData.error || "Unable to load production jobs.");
    setChurches(churchData.churches || []);
    setJobs(jobsData.jobs || []);
  }

  useEffect(() => {
    Promise.all([loadPackages(), loadProduction()]).catch((failure: Error) => setError(failure.message));
  }, []);

  async function createSermonResources(formData: FormData) {
    setSaving(true);
    setError("");
    setActionMessage("");
    try {
      const response = await fetch("/api/production/jobs", { method: "POST", body: formData });
      const data = await response.json() as { error?: string; job?: ProductionJob };
      if (!response.ok) throw new Error(data.error || "Unable to create sermon resources.");
      setActionMessage("Resources created. Review the previews below, then send the package for approval.");
      await loadProduction();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to create sermon resources.");
    } finally {
      setSaving(false);
    }
  }

  async function sendForApproval(job: ProductionJob) {
    if (!window.confirm(`Send ${job.churchName}: ${job.metadata.sermonTitle || job.weekOf} for church approval?`)) return;
    setSendingId(job.id);
    setError("");
    setActionMessage("");
    try {
      const response = await fetch(`/api/production/jobs/${encodeURIComponent(job.id)}/send`, { method: "POST" });
      const data = await response.json() as { error?: string; reviewUrl?: string };
      if (!response.ok) throw new Error(data.error || "Unable to send this package for approval.");
      setCreatedLink(data.reviewUrl || "");
      setActionMessage("Approval request sent. The package is now in the approval workflow.");
      await Promise.all([loadProduction(), loadPackages()]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to send this package for approval.");
    } finally {
      setSendingId("");
    }
  }

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
      <div className="approval-dashboard-head">
        <div><p className="approval-kicker">Sunday Multiplied operations</p><h1>Sermon production</h1><p>Upload the sermon transcript. The church configuration, branding, resource URLs, and approval package are handled automatically.</p></div>
      </div>

      <form className="approval-create" action={(formData) => void createSermonResources(formData)}>
        <div className="approval-create-heading"><h2>Create sermon resources</h2><p>TXT and VTT transcripts are supported. Generated resources stop for your internal review before the church is notified.</p></div>
        <div className="approval-create-grid">
          <label>Church<select name="churchSlug" required defaultValue=""><option value="" disabled>Select a church</option>{churches.map((church) => <option value={church.slug} key={church.slug}>{church.name}</option>)}</select></label>
          <label>Sermon date<input name="weekOf" type="date" required /></label>
          <label className="wide">Sermon transcript<input name="transcript" type="file" accept=".txt,.vtt,text/plain,text/vtt" required /></label>
        </div>
        <button className="approval-approve" disabled={saving}>{saving ? "Creating resources…" : "Create sermon resources"}</button>
        <small>The transcript is normalized, analyzed, converted into the church&apos;s configured resources, and stored as an internal review package.</small>
      </form>

      {error && <div className="approval-admin-error"><strong>Production unavailable</strong><p>{error}</p></div>}
      {actionMessage && <div className="approval-notice" role="status">{actionMessage}</div>}
      {createdLink && <div className="approval-created-link"><strong>Secure review link</strong><input readOnly value={createdLink} onFocus={(event) => event.currentTarget.select()} /><small>The church notification uses this secure review page.</small></div>}

      <section className="approval-create">
        <div className="approval-create-heading"><h2>Production queue</h2><p>Preview generated resources before releasing them into the existing approval workflow.</p></div>
        {jobs.length === 0 ? <p>No sermon production jobs yet.</p> : <div className="approval-table">
          <div className="approval-table-row approval-table-labels"><span>Church / Sermon</span><span>Date</span><span>Metadata</span><span>Resources</span><span>Action</span></div>
          {jobs.map((job) => <div className="approval-table-row" key={job.id}>
            <span><strong>{job.churchName}</strong><small>{job.metadata.sermonTitle || "Title not detected"}</small>{job.metadata.seriesTitle && <small>{job.metadata.seriesTitle}</small>}</span>
            <span>{job.weekOf}</span>
            <span><strong>{job.metadata.scripture || "Passage not detected"}</strong><small>Confidence: {job.metadata.confidence}</small>{job.metadata.speaker && <small>{job.metadata.speaker}</small>}</span>
            <span className="approval-notification">{job.resources.map((resource) => <a key={resource.kind} href={resource.previewUrl} target="_blank" rel="noreferrer">Preview {resource.kind}</a>)}</span>
            <span>{job.status === "sent_for_approval" ? <><strong className="notification-sent">sent for approval</strong>{job.reviewUrl && <a href={job.reviewUrl} target="_blank" rel="noreferrer">Open review</a>}</> : <button type="button" className="approval-approve" onClick={() => void sendForApproval(job)} disabled={sendingId === job.id}>{sendingId === job.id ? "Sending…" : "Send for approval"}</button>}</span>
          </div>)}
        </div>}
      </section>

      <div className="approval-dashboard-head"><div><p className="approval-kicker">Church review</p><h2>Approval packages</h2></div><button type="button" className="approval-approve" onClick={() => setShowManualCreate((value) => !value)}>{showManualCreate ? "Close manual form" : "Manual package"}</button></div>
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
