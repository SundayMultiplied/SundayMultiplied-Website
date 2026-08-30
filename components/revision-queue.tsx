"use client";

import { useEffect, useState } from "react";

type RevisionRequest = {
  id: string;
  packageId: string;
  resourceId: string;
  sourceVersion: number;
  sections: string[];
  action: string;
  message: string | null;
  reviewerName: string;
  reviewerEmail: string | null;
  status: string;
  createdAt: string;
  packageTitle: string;
  weekOf: string;
  scripture: string | null;
  churchName: string;
  resourceKind: string;
  resourceTitle: string;
  previewUrl: string | null;
  generatedVersion?: number | null;
  generatedPreviewUrl?: string | null;
  generationStatus?: string | null;
  generatedAt?: string | null;
};

type RevisedSectionPreview = {
  section: string;
  html: string;
};

type Props = { standalone?: boolean };

const SECTION_SELECTORS: Record<string, string[]> = {
  sermon_recap: [".sm-section--summary"],
  key_takeaways: [".sm-section--takeaways"],
  reflection: [".sm-section--reflection"],
  prayer: [".sm-section--prayer"],
  big_idea: [".sm-section--big-idea"],
  tension: [".sm-section--tension"],
  sermon_snapshot: [".sm-section--summary"],
  key_moments: [".sm-section--key-moments"],
  discussion_questions: [".sm-section--questions"],
  practice: [".sm-section--practice"],
  midweek: [".sm-section--application"],
  leader_tip: [".sm-section--leader-tip"],
  sermon_connection: [".sm-section--family-remember", ".sm-section--summary", ".sm-section--big-idea"],
  scenario_activity: [".sm-section--practice", ".sm-section--application"],
  application: [".sm-section--application", ".sm-section--practice"],
};

export function RevisionQueue({ standalone = false }: Props) {
  const [revisions, setRevisions] = useState<RevisionRequest[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [sectionPreviews, setSectionPreviews] = useState<Record<string, RevisedSectionPreview[]>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [loadingPreviewIds, setLoadingPreviewIds] = useState<string[]>([]);

  async function loadRevisions() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/revision-requests", { cache: "no-store" });
      const data = await response.json() as { revisions?: RevisionRequest[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load revision requests.");
      const next = data.revisions || [];
      setRevisions(next);
      await Promise.all(next.filter((item) => item.generatedPreviewUrl).map((item) => loadSectionPreview(item)));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to load revision requests.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSectionPreview(item: RevisionRequest) {
    if (!item.generatedPreviewUrl) return;
    setLoadingPreviewIds((current) => current.includes(item.id) ? current : [...current, item.id]);
    setPreviewErrors((current) => ({ ...current, [item.id]: "" }));
    try {
      const response = await fetch(item.generatedPreviewUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load proposed revision preview.");
      const html = await response.text();
      const document = new DOMParser().parseFromString(html, "text/html");
      const previews: RevisedSectionPreview[] = [];
      for (const section of item.sections) {
        const selectors = SECTION_SELECTORS[section] || [];
        const element = selectors.map((selector) => document.querySelector(selector)).find(Boolean);
        if (element) previews.push({ section, html: element.innerHTML });
      }
      if (!previews.length) throw new Error("The revised sections could not be located in the proposed resource.");
      setSectionPreviews((current) => ({ ...current, [item.id]: previews }));
    } catch (failure) {
      setPreviewErrors((current) => ({ ...current, [item.id]: failure instanceof Error ? failure.message : "Unable to load proposed revision preview." }));
    } finally {
      setLoadingPreviewIds((current) => current.filter((id) => id !== item.id));
    }
  }

  async function generateRevision(item: RevisionRequest) {
    const verb = item.generatedVersion ? "Regenerate" : "Generate";
    if (!window.confirm(`${verb} the requested changes for ${item.resourceTitle}? The original reviewed version will remain unchanged.`)) return;
    setGeneratingId(item.id);
    setError("");
    setActionMessage("");
    try {
      const response = await fetch(`/api/revision-requests/${encodeURIComponent(item.id)}/generate`, { method: "POST" });
      const data = await response.json() as { error?: string; version?: number };
      if (!response.ok) throw new Error(data.error || "Unable to generate this revision.");
      setActionMessage(`${item.resourceTitle} version ${data.version || item.sourceVersion + 1} is ready for internal review.`);
      await loadRevisions();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to generate this revision.");
    } finally {
      setGeneratingId("");
    }
  }

  useEffect(() => { void loadRevisions(); }, []);

  return (
    <main className="approval-dashboard revision-workspace">
      <div className="approval-dashboard-head revision-workspace-head">
        <div>
          <p className="approval-kicker">Pastoral feedback</p>
          <h1>Revision workspace</h1>
          <p>Generate only the sections the pastor requested. Original approved/reviewed content stays intact while revised versions wait for your internal review.</p>
        </div>
        <div className="revision-workspace-actions">
          {standalone && <a className="approval-approve" href="/approvals">← Production dashboard</a>}
          <button type="button" className="revision-refresh" onClick={() => void loadRevisions()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>

      {error && <div className="approval-admin-error"><strong>Revision workflow unavailable</strong><p>{error}</p></div>}
      {actionMessage && <div className="approval-notice" role="status">{actionMessage}</div>}

      {!error && loading && <div className="revision-empty"><strong>Loading revision requests…</strong></div>}

      {!error && !loading && revisions.length === 0 && (
        <div className="revision-empty"><strong>No pending revision requests.</strong><span>When an approver requests changes, the resource and exact pastoral direction will appear here.</span></div>
      )}

      {!error && !loading && revisions.length > 0 && (
        <>
          <div className="revision-summary-bar">
            <strong>{revisions.length} pending resource {revisions.length === 1 ? "revision" : "revisions"}</strong>
            <span>Targeted regeneration changes only the requested sections and creates a new internal version.</span>
          </div>
          <div className="revision-request-list">
            {revisions.map((item) => {
              const generating = generatingId === item.id;
              const previews = sectionPreviews[item.id] || [];
              const loadingPreview = loadingPreviewIds.includes(item.id);
              return <article className="revision-request-card" key={item.id}>
                <div className="revision-request-head">
                  <div><strong>{item.churchName}</strong><span>{item.packageTitle} · {item.weekOf}</span></div>
                  <span className="revision-badge">Needs revision</span>
                </div>
                <div className="revision-resource-line">
                  <div>
                    <small>{item.resourceKind}</small>
                    <h3>{item.resourceTitle}</h3>
                    <span>Pastor reviewed version {item.sourceVersion}{item.generatedVersion ? ` · Proposed version ${item.generatedVersion}` : ""}</span>
                  </div>
                  <div className="revision-resource-actions">
                    {item.previewUrl && <a href={item.previewUrl} target="_blank" rel="noreferrer">Open reviewed v{item.sourceVersion} ↗</a>}
                    {item.generatedPreviewUrl && <a href={item.generatedPreviewUrl} target="_blank" rel="noreferrer">Open full proposed v{item.generatedVersion} ↗</a>}
                  </div>
                </div>
                <div className="revision-detail-grid">
                  <div><small>Sections</small><div className="revision-tags">{item.sections.map((section) => <span key={section}>{sectionLabel(section)}</span>)}</div></div>
                  <div><small>Requested direction</small><strong>{actionLabel(item.action)}</strong></div>
                  {item.scripture && <div><small>Scripture</small><strong>{item.scripture}</strong></div>}
                  <div><small>Reviewer</small><strong>{item.reviewerName}</strong>{item.reviewerEmail && <span>{item.reviewerEmail}</span>}</div>
                </div>
                {item.message && <div className="revision-pastoral-note"><small>Pastoral notes</small><p>{item.message}</p></div>}

                {item.generatedVersion && (
                  <section className="revision-inline-preview" aria-label={`Proposed version ${item.generatedVersion} revised sections`}>
                    <div className="revision-inline-preview-head">
                      <div><small>Proposed revision</small><strong>Only the changed content</strong></div>
                      <span>v{item.generatedVersion}</span>
                    </div>
                    {loadingPreview && <p className="revision-inline-preview-status">Loading revised sections…</p>}
                    {previewErrors[item.id] && <p className="revision-inline-preview-error">{previewErrors[item.id]}</p>}
                    {!loadingPreview && !previewErrors[item.id] && previews.map((preview) => (
                      <div className="revision-inline-section" key={preview.section}>
                        <h4>{sectionLabel(preview.section)}</h4>
                        <div className="revision-inline-section-content" dangerouslySetInnerHTML={{ __html: preview.html }} />
                      </div>
                    ))}
                  </section>
                )}

                <div className="revision-generation-actions">
                  <button type="button" className="approval-approve" disabled={generating} onClick={() => void generateRevision(item)}>
                    {generating ? "Generating revision…" : item.generatedVersion ? "Regenerate proposed revision" : "Generate revision"}
                  </button>
                  {item.generatedVersion && <span className="revision-stage-note">Proposed v{item.generatedVersion} · ready for internal review</span>}
                </div>
                <footer><span>Received {formatAdminDate(item.createdAt)}</span><span>{item.generatedAt ? `Last generated ${formatAdminDate(item.generatedAt)}` : "No revised version generated yet"}</span></footer>
              </article>;
            })}
          </div>
        </>
      )}
    </main>
  );
}

function actionLabel(value: string) {
  const labels: Record<string, string> = {
    revise_existing: "Revise existing content",
    new_set: "Create a completely new set",
    new_scenario: "Create a different scenario / activity",
    more_practical: "Make it more practical",
    more_discussion_oriented: "Make it more discussion-oriented",
    simplify: "Make it clearer / more accessible",
    tone_wording: "Adjust tone or wording",
    other: "Other request",
  };
  return labels[value] || value.replaceAll("_", " ");
}

function sectionLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAdminDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
