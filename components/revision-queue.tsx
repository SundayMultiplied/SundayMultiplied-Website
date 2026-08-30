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
};

export function RevisionQueue() {
  const [revisions, setRevisions] = useState<RevisionRequest[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/revision-requests", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { revisions?: RevisionRequest[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load revision requests.");
        setRevisions(data.revisions || []);
      })
      .catch((failure: Error) => setError(failure.message));
  }, []);

  if (error) return <section className="approval-dashboard"><div className="approval-admin-error"><strong>Revision queue unavailable</strong><p>{error}</p></div></section>;
  if (!revisions.length) return null;

  return (
    <section id="needs-revision" className="approval-dashboard" aria-labelledby="revision-queue-title">
      <div className="approval-dashboard-head">
        <div>
          <p className="approval-kicker">Pastoral feedback</p>
          <h2 id="revision-queue-title">Needs revision</h2>
          <p>{revisions.length} pending resource {revisions.length === 1 ? "revision" : "revisions"}. Stage 2 will add targeted regeneration actions here.</p>
        </div>
      </div>
      <div className="approval-table">
        <div className="approval-table-row approval-table-labels"><span>Church / Sermon</span><span>Resource</span><span>Requested changes</span><span>Reviewer</span><span>Status</span></div>
        {revisions.map((item) => <div className="approval-table-row" key={item.id}>
          <span><strong>{item.churchName}</strong><small>{item.packageTitle}</small><small>{item.weekOf}{item.scripture ? ` · ${item.scripture}` : ""}</small></span>
          <span><strong>{item.resourceTitle}</strong><small>{item.resourceKind} · Version {item.sourceVersion}</small></span>
          <span className="approval-notification"><strong>{actionLabel(item.action)}</strong><small>{item.sections.map(sectionLabel).join(" · ")}</small>{item.message && <small>“{item.message}”</small>}</span>
          <span><strong>{item.reviewerName}</strong>{item.reviewerEmail && <small>{item.reviewerEmail}</small>}</span>
          <span className="approval-status status-revision_requested">needs revision</span>
        </div>)}
      </div>
    </section>
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
