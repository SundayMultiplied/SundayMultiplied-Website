"use client";

import { useEffect, useState } from "react";

type ChurchConfig = { slug: string; name: string; resources: string[]; cssUrl: string; logoUrl?: string; reviewerEmail?: string };
type ProductionJob = {
  id: string; churchSlug: string; churchName: string; weekOf: string; createdAt: string;
  status: "ready_for_internal_review" | "sent_for_approval"; sourceFilename: string;
  metadata: { sermonTitle: string; seriesTitle: string; scripture: string; speaker: string; confidence: "high" | "medium" | "low" };
  resources: Array<{ kind: string; title: string; previewUrl: string }>;
  reviewUrl?: string;
};
type RevisionRequest = { id: string; previewUrl: string | null };

export function ProductionDashboard() {
  const [churches, setChurches] = useState<ChurchConfig[]>([]);
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [revisions, setRevisions] = useState<RevisionRequest[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState("");
  const [deletingJobs, setDeletingJobs] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

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
    setSelectedJobIds((current) => current.filter((id) => (jobsData.jobs || []).some((job) => job.id === id && job.status === "ready_for_internal_review")));
  }

  async function loadRevisionStatus() {
    const response = await fetch("/api/revision-requests", { cache: "no-store" });
    const data = await response.json() as { error?: string; revisions?: RevisionRequest[] };
    if (!response.ok) throw new Error(data.error || "Unable to load revision status.");
    setRevisions(data.revisions || []);
  }

  useEffect(() => { Promise.all([loadProduction(), loadRevisionStatus()]).catch((failure: Error) => setError(failure.message)); }, []);

  async function createSermonResources(formData: FormData) {
    setSaving(true); setError(""); setActionMessage("");
    try {
      const response = await fetch("/api/production/jobs", { method: "POST", body: formData });
      const data = await response.json() as { error?: string; job?: ProductionJob };
      if (!response.ok) throw new Error(data.error || "Unable to create sermon resources.");
      setActionMessage("Resources created. Review the previews below, then send the package for approval.");
      await loadProduction();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to create sermon resources."); }
    finally { setSaving(false); }
  }

  async function sendForApproval(job: ProductionJob) {
    const church = churches.find((item) => item.slug === job.churchSlug);
    const approver = church?.reviewerEmail || "Reviewer not configured";
    const packageName = job.metadata.sermonTitle || job.weekOf;
    if (!window.confirm(`Send this package for church approval?\n\nChurch: ${job.churchName}\nPackage: ${packageName}\nApprover: ${approver}`)) return;
    setSendingId(job.id); setError(""); setActionMessage("");
    try {
      const response = await fetch(`/api/production/jobs/${encodeURIComponent(job.id)}/send`, { method: "POST" });
      const data = await response.json() as { error?: string; reviewUrl?: string };
      if (!response.ok) throw new Error(data.error || "Unable to send this package for approval.");
      setCreatedLink(data.reviewUrl || "");
      setActionMessage("Approval request sent. The package is now in the approval workflow.");
      setSelectedJobIds((current) => current.filter((id) => id !== job.id));
      await Promise.all([loadProduction(), loadRevisionStatus()]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to send this package for approval."); }
    finally { setSendingId(""); }
  }

  function toggleJobSelection(job: ProductionJob) {
    if (job.status !== "ready_for_internal_review") return;
    setSelectedJobIds((current) => current.includes(job.id) ? current.filter((id) => id !== job.id) : [...current, job.id]);
  }

  async function deleteSelectedJobs() {
    if (!selectedJobIds.length) return;
    const selectedJobs = jobs.filter((job) => selectedJobIds.includes(job.id));
    const label = selectedJobs.length === 1 ? `${selectedJobs[0].churchName}: ${selectedJobs[0].metadata.sermonTitle || selectedJobs[0].weekOf}` : `${selectedJobs.length} production jobs`;
    if (!window.confirm(`Delete ${label}? This permanently removes the internal transcript and generated HTML from production storage.`)) return;
    setDeletingJobs(true); setError(""); setActionMessage("");
    try {
      for (const jobId of selectedJobIds) {
        const response = await fetch(`/api/production/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to delete a production job.");
      }
      setSelectedJobIds([]); setActionMessage(`${selectedJobs.length === 1 ? "Production job" : `${selectedJobs.length} production jobs`} deleted.`); await loadProduction();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to delete the selected production jobs."); }
    finally { setDeletingJobs(false); }
  }

  function hasPendingRevision(jobId: string) {
    const marker = `/api/production/preview/${jobId}/`;
    return revisions.some((revision) => revision.previewUrl?.includes(marker));
  }

  return <main className="approval-dashboard">
    <div className="approval-dashboard-head"><div><p className="approval-kicker">Sunday Multiplied operations</p><h1>Resource Production</h1><p>Upload a sermon transcript, generate the church&apos;s configured resources, review them internally, and release them into pastoral approval.</p></div></div>
    <form className="approval-create production-create" onSubmit={(event) => { event.preventDefault(); if (!saving) void createSermonResources(new FormData(event.currentTarget)); }}>
      <div className="approval-create-heading"><h2>Create sermon resources</h2><p>TXT and VTT transcripts are supported. Canonical sermon analysis runs first, then downstream resources are generated and held for internal review.</p></div>
      <div className="approval-create-grid">
        <label><span className="approval-field-label">Church</span><select name="churchSlug" required defaultValue=""><option value="" disabled>Select a church…</option>{churches.map((church) => <option value={church.slug} key={church.slug}>{church.name}</option>)}</select></label>
        <label><span className="approval-field-label">Sermon date</span><input name="weekOf" type="date" required /></label>
        <label className="wide"><span className="approval-field-label">Sermon transcript</span><input name="transcript" type="file" accept=".txt,.vtt,text/plain,text/vtt" required /></label>
      </div>
      <button className="approval-approve" disabled={saving}>{saving ? "Creating resources…" : "Create sermon resources"}</button>
      {saving ? <div className="production-progress" role="status" aria-live="polite"><strong>Generating sermon resources</strong><span>The transcript is being analyzed, then the resource package is being built.</span></div> : <small>The transcript, canonical analysis, and generated resources are stored as one production job.</small>}
    </form>
    {error && <div className="approval-admin-error"><strong>Production unavailable</strong><p>{error}</p></div>}
    {actionMessage && <div className="approval-notice" role="status">{actionMessage}</div>}
    {createdLink && <div className="approval-created-link"><strong>Secure review link</strong><input readOnly value={createdLink} onFocus={(event) => event.currentTarget.select()} /><small>The church notification uses this secure review page.</small></div>}
    <section className="approval-create production-queue">
      <div className="approval-create-heading production-queue-heading"><div><h2>Production queue</h2><p>Preview generated resources before releasing them into pastoral review.</p></div><button type="button" className="production-delete" onClick={() => void deleteSelectedJobs()} disabled={!selectedJobIds.length || deletingJobs}>{deletingJobs ? "Deleting…" : `Delete selected${selectedJobIds.length ? ` (${selectedJobIds.length})` : ""}`}</button></div>
      {jobs.length === 0 ? <p>No sermon production jobs yet.</p> : <div className="approval-table production-job-table">
        <div className="approval-table-row approval-table-labels"><span>Select</span><span>Church / Sermon</span><span>Date</span><span>Metadata</span><span>Resources</span><span>Action</span></div>
        {jobs.map((job) => { const revisionRequested = hasPendingRevision(job.id); return <div className="approval-table-row" key={job.id}>
          <span className="production-job-select"><input type="checkbox" aria-label={`Select ${job.churchName} ${job.metadata.sermonTitle || job.weekOf}`} checked={selectedJobIds.includes(job.id)} disabled={job.status !== "ready_for_internal_review" || deletingJobs} onChange={() => toggleJobSelection(job)} /></span>
          <span><strong>{job.churchName}</strong><small>{job.metadata.sermonTitle || "Title not detected"}</small>{job.metadata.seriesTitle && <small>{job.metadata.seriesTitle}</small>}<small className="production-job-id" title={job.id}>Job {job.id.slice(0, 8)}</small></span>
          <span>{job.weekOf}</span>
          <span className="approval-metadata"><strong>{job.metadata.scripture || "Passage not detected"}</strong><small>Confidence: {job.metadata.confidence}</small>{job.metadata.speaker && <small>{job.metadata.speaker}</small>}</span>
          <span className="approval-notification">{job.resources.map((resource) => <a key={resource.kind} href={resource.previewUrl} target="_blank" rel="noreferrer">Preview {resource.kind}</a>)}</span>
          <span className="production-action-stack">{revisionRequested ? <><a className="approval-status status-revision_requested production-revision-link" href="/revisions">revision requested</a>{job.reviewUrl && <a href={job.reviewUrl} target="_blank" rel="noreferrer">Open review</a>}</> : job.status === "sent_for_approval" ? <><strong className="notification-sent">sent for approval</strong>{job.reviewUrl && <a href={job.reviewUrl} target="_blank" rel="noreferrer">Open review</a>}</> : <button type="button" className="approval-approve" onClick={() => void sendForApproval(job)} disabled={sendingId === job.id}>{sendingId === job.id ? "Sending…" : "Send for approval"}</button>}</span>
        </div>; })}
      </div>}
    </section>
  </main>;
}
