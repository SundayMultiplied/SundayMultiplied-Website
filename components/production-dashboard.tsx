"use client";

import { useEffect, useState } from "react";
import { TeachingSourcesForm } from "./teaching-sources-form";
import { SermonAnalysisReview } from "./sermon-analysis-review";
import type { CanonicalSermonAnalysis } from "../worker/sermon-analysis";

type ChurchConfig = { slug: string; name: string; resources: string[]; cssUrl: string; logoUrl?: string; reviewerEmail?: string };
type ProductionJob = {
  id: string; churchSlug: string; churchName: string; weekOf: string; createdAt: string;
  status: "awaiting_analysis_review" | "ready_for_internal_review" | "sent_for_approval"; sourceFilename: string;
  metadata: { sermonTitle: string; seriesTitle: string; scripture: string; speaker: string; confidence: "high" | "medium" | "low" };
  resources: Array<{ kind: string; title: string; previewUrl: string }>;
  sourceFiles?: Array<{ sourceId: string; sourceType: string; filename: string }>;
  analysisStorageKey?: string;
  reviewUrl?: string;
};
type RevisionRequest = { id: string; previewUrl: string | null };
type ComparisonFeedback = { id: string; reviewerName: string; preferred: "A" | "B" | "C"; notes: string; createdAt: string };
type ComparisonSet = {
  id: string; sourceJobId: string; churchName: string; weekOf: string; sermonTitle: string; createdAt: string; reviewUrl: string;
  blindOrder: Record<"A" | "B" | "C", "v1" | "v2" | "v3">;
  variants: Array<{ label: "A" | "B" | "C"; resources: Array<{ kind: string; previewUrl: string }> }>;
  feedback?: ComparisonFeedback[];
};

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
  const [analysis, setAnalysis] = useState<CanonicalSermonAnalysis | null>(null);
  const [analysisJob, setAnalysisJob] = useState<ProductionJob | null>(null);
  const [loadingAnalysisId, setLoadingAnalysisId] = useState("");
  const [generatingId, setGeneratingId] = useState("");
  const [comparisons, setComparisons] = useState<ComparisonSet[]>([]);
  const [comparingId, setComparingId] = useState("");

  async function loadProduction() {
    const [churchResponse, jobsResponse, comparisonsResponse] = await Promise.all([
      fetch("/api/production/churches", { cache: "no-store" }),
      fetch("/api/production/jobs", { cache: "no-store" }),
      fetch("/api/comparisons", { cache: "no-store" }),
    ]);
    const churchData = await churchResponse.json() as { error?: string; churches?: ChurchConfig[] };
    const jobsData = await jobsResponse.json() as { error?: string; jobs?: ProductionJob[] };
    const comparisonsData = await comparisonsResponse.json() as { error?: string; comparisons?: ComparisonSet[] };
    if (!churchResponse.ok) throw new Error(churchData.error || "Unable to load configured churches.");
    if (!jobsResponse.ok) throw new Error(jobsData.error || "Unable to load production jobs.");
    if (!comparisonsResponse.ok) throw new Error(comparisonsData.error || "Unable to load comparison sets.");
    setChurches(churchData.churches || []);
    setJobs(jobsData.jobs || []);
    setComparisons(comparisonsData.comparisons || []);
    setSelectedJobIds((current) => current.filter((id) => (jobsData.jobs || []).some((job) => job.id === id && job.status !== "sent_for_approval")));
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
      setActionMessage("Analysis created. Review and accept it before generating resources.");
      await loadProduction();
      if (data.job) await openAnalysis(data.job);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to create sermon resources."); }
    finally { setSaving(false); }
  }

  async function openAnalysis(job: ProductionJob) {
    setLoadingAnalysisId(job.id); setError("");
    try {
      const response = await fetch(`/api/production/jobs/${encodeURIComponent(job.id)}/analysis`, { cache: "no-store" });
      const data = await response.json() as { error?: string; analysis?: CanonicalSermonAnalysis };
      if (!response.ok || !data.analysis) throw new Error(data.error || "Unable to load the sermon analysis.");
      setAnalysisJob(job); setAnalysis(data.analysis);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to load the sermon analysis."); }
    finally { setLoadingAnalysisId(""); }
  }

  async function acceptAnalysisAndGenerate() {
    if (!analysisJob) return;
    setGeneratingId(analysisJob.id); setError(""); setActionMessage("");
    try {
      const response = await fetch(`/api/production/jobs/${encodeURIComponent(analysisJob.id)}/generate`, { method: "POST" });
      const data = await response.json() as { error?: string; job?: ProductionJob };
      if (!response.ok) throw new Error(data.error || "Unable to generate resources from this analysis.");
      setAnalysis(null); setAnalysisJob(null);
      setActionMessage("Analysis accepted. Resources are ready for internal review.");
      await loadProduction();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to generate resources from this analysis."); }
    finally { setGeneratingId(""); }
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

  async function createComparison(job: ProductionJob) {
    if (!window.confirm(`Create a blinded V1 / V2 / V3 comparison for ${job.metadata.sermonTitle || job.weekOf}?\n\nThis generates three fresh versions of every subscribed resource and may take several minutes.`)) return;
    setComparingId(job.id); setError(""); setActionMessage("");
    try {
      const response = await fetch("/api/comparisons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: job.id }) });
      const data = await response.json() as { error?: string; comparison?: ComparisonSet };
      if (!response.ok || !data.comparison) throw new Error(data.error || "Unable to create the comparison set.");
      setActionMessage("Blinded comparison created. The family review link is ready to share.");
      setCreatedLink(data.comparison.reviewUrl);
      await loadProduction();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to create the comparison set."); }
    finally { setComparingId(""); }
  }

  function toggleJobSelection(job: ProductionJob) {
    if (job.status === "sent_for_approval") return;
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
    <div className="approval-dashboard-head"><div><p className="approval-kicker">Sunday Multiplied operations</p><h1>Resource Production</h1><p>Create a transcript-led teaching source bundle, generate the church&apos;s resources, review them internally, and release them into pastoral approval.</p></div></div>
    <TeachingSourcesForm churches={churches} saving={saving} onSubmit={(formData) => void createSermonResources(formData)} />
    {error && <div className="approval-admin-error"><strong>Production unavailable</strong><p>{error}</p></div>}
    {actionMessage && <div className="approval-notice" role="status">{actionMessage}</div>}
    {createdLink && <div className="approval-created-link"><strong>Secure review link</strong><input readOnly value={createdLink} onFocus={(event) => event.currentTarget.select()} /><small>The church notification uses this secure review page.</small></div>}
    {analysis && analysisJob && <SermonAnalysisReview analysis={analysis} job={analysisJob} generating={generatingId === analysisJob.id} onClose={() => { setAnalysis(null); setAnalysisJob(null); }} onGenerate={() => void acceptAnalysisAndGenerate()} />}
    <section className="approval-create production-queue">
      <div className="approval-create-heading production-queue-heading"><div><h2>Production queue</h2><p>Review sermon analysis first, then preview generated resources before pastoral review.</p></div><button type="button" className="production-delete" onClick={() => void deleteSelectedJobs()} disabled={!selectedJobIds.length || deletingJobs}>{deletingJobs ? "Deleting…" : `Delete selected${selectedJobIds.length ? ` (${selectedJobIds.length})` : ""}`}</button></div>
      {jobs.length === 0 ? <p>No sermon production jobs yet.</p> : <div className="approval-table production-job-table">
        <div className="approval-table-row approval-table-labels"><span>Select</span><span>Church / Sermon</span><span>Date</span><span>Metadata</span><span>Resources</span><span>Action</span></div>
        {jobs.map((job) => { const revisionRequested = hasPendingRevision(job.id); return <div className="approval-table-row" key={job.id}>
          <span className="production-job-select"><input type="checkbox" aria-label={`Select ${job.churchName} ${job.metadata.sermonTitle || job.weekOf}`} checked={selectedJobIds.includes(job.id)} disabled={job.status === "sent_for_approval" || deletingJobs} onChange={() => toggleJobSelection(job)} /></span>
          <span><strong>{job.churchName}</strong><small>{job.metadata.sermonTitle || "Title not detected"}</small>{job.metadata.seriesTitle && <small>{job.metadata.seriesTitle}</small>}<small className="production-job-id" title={job.id}>Job {job.id.slice(0, 8)}</small></span>
          <span>{job.weekOf}</span>
          <span className="approval-metadata"><strong>{job.metadata.scripture || "Passage not detected"}</strong><small>Confidence: {job.metadata.confidence}</small>{job.metadata.speaker && <small>{job.metadata.speaker}</small>}</span>
          <span className="approval-notification">{job.analysisStorageKey && <button type="button" className="analysis-open-button" onClick={() => void openAnalysis(job)} disabled={loadingAnalysisId === job.id}>{loadingAnalysisId === job.id ? "Loading analysis…" : "View analysis"}</button>}{job.resources.map((resource) => <a key={resource.kind} href={resource.previewUrl} target="_blank" rel="noreferrer">Preview {resource.kind}</a>)}</span>
          <span className="production-action-stack">{job.status === "awaiting_analysis_review" ? <button type="button" className="approval-approve" onClick={() => void openAnalysis(job)} disabled={loadingAnalysisId === job.id}>{loadingAnalysisId === job.id ? "Loading…" : "Review analysis"}</button> : <>{revisionRequested ? <><a className="approval-status status-revision_requested production-revision-link" href="/revisions">revision requested</a>{job.reviewUrl && <a href={job.reviewUrl} target="_blank" rel="noreferrer">Open review</a>}</> : job.status === "sent_for_approval" ? <><strong className="notification-sent">sent for approval</strong>{job.reviewUrl && <a href={job.reviewUrl} target="_blank" rel="noreferrer">Open review</a>}</> : <button type="button" className="approval-approve" onClick={() => void sendForApproval(job)} disabled={sendingId === job.id}>{sendingId === job.id ? "Sending…" : "Send for approval"}</button>}<button type="button" className="comparison-create-button" onClick={() => void createComparison(job)} disabled={comparingId === job.id}>{comparingId === job.id ? "Generating A/B/C…" : "Create A/B/C comparison"}</button></>}</span>
        </div>; })}
      </div>}
    </section>
    <section className="approval-create comparison-admin-section">
      <div className="approval-create-heading"><div><p className="approval-kicker">Internal testing</p><h2>Comparison Mode</h2><p>Each set randomly assigns V1, V2, and V3 to A, B, and C. Reviewers only see the letters.</p></div></div>
      {comparisons.length === 0 ? <p>No comparison sets yet. Create one from a generated job above.</p> : <div className="comparison-set-list">{comparisons.map((comparison) => <article key={comparison.id} className="comparison-set-card">
        <div><strong>{comparison.sermonTitle}</strong><small>{comparison.churchName} · {comparison.weekOf}</small></div>
        <a href={comparison.reviewUrl} target="_blank" rel="noreferrer">Open blinded review</a>
        <details><summary>Reveal version mapping</summary><p>A = {comparison.blindOrder.A.toUpperCase()} · B = {comparison.blindOrder.B.toUpperCase()} · C = {comparison.blindOrder.C.toUpperCase()}</p></details>
        <div className="comparison-feedback-summary"><strong>{comparison.feedback?.length || 0} responses</strong>{comparison.feedback?.map((item) => <p key={item.id}><b>{item.reviewerName}</b>: {item.preferred}{item.notes ? ` — ${item.notes}` : ""}</p>)}</div>
      </article>)}</div>}
    </section>
  </main>;
}
