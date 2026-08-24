"use client";

import { useEffect, useState } from "react";
import type { ReviewPackage } from "../lib/approval-types";

type Props = { token: string };

export function ApprovalReview({ token }: Props) {
  const [review, setReview] = useState<ReviewPackage | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [overallFeedback, setOverallFeedback] = useState("");
  const [resourceFeedback, setResourceFeedback] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<"approved" | "revision_requested" | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reviews/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as ReviewPackage & { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to open this review.");
        if (!cancelled) {
          setReview(data);
          setReviewerName(data.reviewerName || "");
          setReviewerEmail(data.reviewerEmail || "");
          void fetch(`/api/reviews/${encodeURIComponent(token)}/view`, { method: "POST" });
        }
      })
      .catch((error: Error) => !cancelled && setLoadingError(error.message));
    return () => { cancelled = true; };
  }, [token]);

  async function submit(decision: "approve" | "request_revision") {
    setSubmitting(true);
    setFormError("");
    const response = await fetch(`/api/reviews/${encodeURIComponent(token)}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        reviewerName,
        reviewerEmail,
        overallFeedback,
        resourceFeedback: Object.entries(resourceFeedback).map(([resourceId, message]) => ({ resourceId, message })),
      }),
    });
    const result = await response.json() as { error?: string; status?: "approved" | "revision_requested" };
    setSubmitting(false);
    if (!response.ok) return setFormError(result.error || "Your response could not be saved.");
    if (result.status) setSubmitted(result.status);
  }

  if (loadingError) return <ReviewMessage title="This review is unavailable" message={loadingError} />;
  if (!review) return <ReviewMessage title="Opening your review…" message="Loading this week's resources." />;
  if (submitted) {
    return <ReviewMessage
      title={submitted === "approved" ? "Resources approved" : "Revision request received"}
      message={submitted === "approved" ? "Thank you. Sunday Multiplied has been notified that this package is approved." : "Thank you. Your notes have been saved and Sunday Multiplied has been notified."}
    />;
  }

  const alreadyDecided = ["approved", "revision_requested", "delivered", "archived"].includes(review.status);

  return (
    <main className="approval-shell">
      <header className="approval-header">
        <div className="approval-brand"><span>SM</span><strong>Sunday Multiplied</strong></div>
        <p>Resource review</p>
      </header>
      <section className="approval-intro">
        <p className="approval-kicker">{review.churchName} · Week of {formatDate(review.weekOf)}</p>
        <h1>{review.title}</h1>
        <div className="approval-meta">
          {review.seriesTitle && <span><small>Series</small>{review.seriesTitle}</span>}
          {review.scripture && <span><small>Scripture</small>{review.scripture}</span>}
          <span><small>Status</small>{statusLabel(review.status)}</span>
        </div>
      </section>

      <section className="approval-content">
        <div className="approval-section-heading">
          <div><p className="approval-kicker">Weekly package</p><h2>Review each resource.</h2></div>
          <p>Open each resource, then leave a note beside anything that needs attention. Submit one decision for the complete package.</p>
        </div>
        <div className="approval-resource-list">
          {review.resources.map((resource, index) => (
            <article className="approval-resource" key={resource.id}>
              <div className="approval-resource-number">0{index + 1}</div>
              <div className="approval-resource-copy">
                <p>{resource.kind} · Version {resource.version}</p>
                <h3>{resource.title}</h3>
                {resource.previewUrl
                  ? <a href={`/api/reviews/${encodeURIComponent(token)}/resource/${resource.id}`} target="_blank" rel="noreferrer">Open resource ↗</a>
                  : <span className="approval-unavailable">Preview being prepared</span>}
              </div>
              <label className="approval-note">Note for this resource
                <textarea value={resourceFeedback[resource.id] || ""} onChange={(event) => setResourceFeedback((current) => ({ ...current, [resource.id]: event.target.value }))} placeholder="Optional—identify a wording, question, or section to revise." rows={4} />
              </label>
            </article>
          ))}
        </div>

        <section className="approval-decision">
          <div><p className="approval-kicker">One response</p><h2>Your decision for this package</h2></div>
          {alreadyDecided ? (
            <div className="approval-complete"><strong>{statusLabel(review.status)}</strong><p>This package already has a recorded decision. Contact Sunday Multiplied if it needs to be reopened.</p></div>
          ) : (
            <div className="approval-form">
              <div className="approval-fields">
                <label>Your name<input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} autoComplete="name" /></label>
                <label>Email <small>(optional)</small><input type="email" value={reviewerEmail} onChange={(event) => setReviewerEmail(event.target.value)} autoComplete="email" /></label>
              </div>
              <label>Overall feedback<textarea value={overallFeedback} onChange={(event) => setOverallFeedback(event.target.value)} placeholder="Add any notes that apply to the complete package." rows={5} /></label>
              {formError && <p className="approval-error" role="alert">{formError}</p>}
              <div className="approval-actions">
                <button type="button" className="approval-revise" disabled={submitting} onClick={() => void submit("request_revision")}>Request revisions</button>
                <button type="button" className="approval-approve" disabled={submitting} onClick={() => void submit("approve")}>{submitting ? "Saving…" : "Approve complete package"}</button>
              </div>
            </div>
          )}
        </section>
      </section>
      <footer className="approval-footer"><strong>Sunday Multiplied</strong><span>Helping Sunday shape the other 167 hours.</span></footer>
    </main>
  );
}

function ReviewMessage({ title, message }: { title: string; message: string }) {
  return <main className="approval-message"><div className="approval-brand"><span>SM</span><strong>Sunday Multiplied</strong></div><h1>{title}</h1><p>{message}</p></main>;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
