"use client";

import { useEffect, useState } from "react";
import type { ReviewPackage } from "../lib/approval-types";

type Props = { token: string };
type Decision = "approve" | "request_revision";
type RevisionDraft = { sections: string[]; action: string; message: string };

const REVISION_ACTIONS = [
  ["revise_existing", "Revise the existing content"],
  ["new_set", "Create a completely new set"],
  ["new_scenario", "Create a different scenario / activity"],
  ["more_practical", "Make it more practical / application-focused"],
  ["more_discussion_oriented", "Make it more discussion-oriented"],
  ["simplify", "Make it clearer / more accessible"],
  ["tone_wording", "Adjust tone or wording"],
  ["other", "Other request"],
] as const;

export function ApprovalReview({ token }: Props) {
  const [review, setReview] = useState<ReviewPackage | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [overallFeedback, setOverallFeedback] = useState("");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, RevisionDraft>>({});
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
          setDecisions(Object.fromEntries(data.resources
            .filter((resource) => resource.reviewDecision !== "pending")
            .map((resource) => [resource.id, resource.reviewDecision === "approved" ? "approve" : "request_revision"])));
          void fetch(`/api/reviews/${encodeURIComponent(token)}/view`, { method: "POST" });
        }
      })
      .catch((error: Error) => !cancelled && setLoadingError(error.message));
    return () => { cancelled = true; };
  }, [token]);

  function chooseDecision(resourceId: string, decision: Decision) {
    setDecisions((current) => ({ ...current, [resourceId]: decision }));
    if (decision === "request_revision") {
      setRevisionDrafts((current) => ({
        ...current,
        [resourceId]: current[resourceId] || { sections: [], action: "", message: "" },
      }));
    }
  }

  function toggleSection(resourceId: string, section: string) {
    setRevisionDrafts((current) => {
      const draft = current[resourceId] || { sections: [], action: "", message: "" };
      return {
        ...current,
        [resourceId]: {
          ...draft,
          sections: draft.sections.includes(section)
            ? draft.sections.filter((item) => item !== section)
            : [...draft.sections, section],
        },
      };
    });
  }

  async function submit() {
    if (!review) return;
    setFormError("");
    const undecided = review.resources.filter((resource) => !decisions[resource.id]);
    if (undecided.length) {
      setFormError("Please approve or request changes for every resource before submitting.");
      return;
    }
    for (const resource of review.resources) {
      if (decisions[resource.id] !== "request_revision") continue;
      const draft = revisionDrafts[resource.id];
      if (!draft?.sections.length) {
        setFormError(`Select at least one section that needs attention in ${resource.title}.`);
        return;
      }
      if (!draft.action) {
        setFormError(`Choose the type of change you want in ${resource.title}.`);
        return;
      }
    }

    setSubmitting(true);
    const response = await fetch(`/api/reviews/${encodeURIComponent(token)}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviewerName,
        reviewerEmail,
        overallFeedback,
        resourceDecisions: review.resources.map((resource) => ({
          resourceId: resource.id,
          decision: decisions[resource.id],
          sections: revisionDrafts[resource.id]?.sections || [],
          action: revisionDrafts[resource.id]?.action || "",
          message: revisionDrafts[resource.id]?.message || "",
        })),
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
      message={submitted === "approved"
        ? "Thank you. Sunday Multiplied has been notified that every resource is approved."
        : "Thank you. Your resource-specific revision requests have been saved and Sunday Multiplied has been notified."}
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
          <p>Approve each resource individually. If something needs attention, identify the section and tell us what kind of change would make it more useful for your church.</p>
        </div>

        <div className="approval-resource-list">
          {review.resources.map((resource, index) => {
            const decision = decisions[resource.id];
            const draft = revisionDrafts[resource.id] || { sections: [], action: "", message: "" };
            return (
              <article className="approval-resource" key={resource.id}>
                <div className="approval-resource-number">0{index + 1}</div>
                <div className="approval-resource-copy">
                  <p>{resource.kind} · Version {resource.version}</p>
                  <h3>{resource.title}</h3>
                  {resource.previewUrl
                    ? <a href={`/api/reviews/${encodeURIComponent(token)}/resource/${resource.id}`} target="_blank" rel="noreferrer">Open resource ↗</a>
                    : <span className="approval-unavailable">Preview being prepared</span>}
                  {!alreadyDecided && <div className="approval-actions">
                    <button type="button" className={decision === "approve" ? "approval-approve" : "approval-revise"} onClick={() => chooseDecision(resource.id, "approve")}>✓ Approve this resource</button>
                    <button type="button" className={decision === "request_revision" ? "approval-approve" : "approval-revise"} onClick={() => chooseDecision(resource.id, "request_revision")}>Request changes</button>
                  </div>}
                </div>

                {!alreadyDecided && decision === "request_revision" && <div className="approval-note">
                  <strong>What needs attention?</strong>
                  <div className="approval-fields">
                    {sectionOptions(resource.kind).map(([value, label]) => <label key={value}>
                      <span><input type="checkbox" checked={draft.sections.includes(value)} onChange={() => toggleSection(resource.id, value)} /> {label}</span>
                    </label>)}
                  </div>
                  <label>What kind of change would you like?
                    <select value={draft.action} onChange={(event) => setRevisionDrafts((current) => ({ ...current, [resource.id]: { ...draft, action: event.target.value } }))}>
                      <option value="">Choose a revision direction…</option>
                      {REVISION_ACTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>Pastoral notes <small>(optional but helpful)</small>
                    <textarea value={draft.message} onChange={(event) => setRevisionDrafts((current) => ({ ...current, [resource.id]: { ...draft, message: event.target.value } }))} placeholder="Example: Questions 3–5 feel too similar. Give us more application-oriented questions for parents." rows={4} />
                  </label>
                </div>}
              </article>
            );
          })}
        </div>

        <section className="approval-decision">
          <div><p className="approval-kicker">Final response</p><h2>Submit your review</h2></div>
          {alreadyDecided ? (
            <div className="approval-complete"><strong>{statusLabel(review.status)}</strong><p>This package already has a recorded decision. Sunday Multiplied will send the revised resource back through this approval process when it is ready.</p></div>
          ) : (
            <div className="approval-form">
              <div className="approval-fields">
                <label>Your name<input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} autoComplete="name" /></label>
                <label>Email <small>(optional)</small><input type="email" value={reviewerEmail} onChange={(event) => setReviewerEmail(event.target.value)} autoComplete="email" /></label>
              </div>
              <label>Overall package feedback <small>(optional)</small><textarea value={overallFeedback} onChange={(event) => setOverallFeedback(event.target.value)} placeholder="Use this for comments that apply to the package as a whole." rows={4} /></label>
              {formError && <p className="approval-error" role="alert">{formError}</p>}
              <div className="approval-actions">
                <button type="button" className="approval-approve" disabled={submitting} onClick={() => void submit()}>{submitting ? "Saving review…" : "Submit review"}</button>
              </div>
            </div>
          )}
        </section>
      </section>
      <footer className="approval-footer"><strong>Sunday Multiplied</strong><span>Helping Sunday shape the other 167 hours.</span></footer>
    </main>
  );
}

function sectionOptions(kind: string): Array<[string, string]> {
  const normalized = kind.toLowerCase();
  if (normalized.includes("monday")) return [
    ["sermon_recap", "Sermon recap"], ["key_takeaways", "Key takeaways"], ["reflection", "Reflection question"],
    ["prayer", "Prayer"], ["tone_wording", "Tone / wording"], ["other", "Other"],
  ];
  if (normalized.includes("group")) return [
    ["big_idea", "Big Idea"], ["tension", "The Tension"], ["scripture", "Scripture"], ["sermon_snapshot", "Sermon Snapshot"],
    ["key_moments", "Key Moments"], ["discussion_questions", "Discussion questions"], ["practice", "Practice This Week"],
    ["midweek", "Midweek reinforcement"], ["leader_tip", "Leader tip"], ["prayer", "Closing prayer"],
    ["tone_wording", "Tone / wording"], ["other", "Other"],
  ];
  return [
    ["sermon_connection", "Sermon connection / recap"], ["scripture", "Scripture"], ["discussion_questions", "Family discussion questions"],
    ["scenario_activity", "Scenario / family activity"], ["application", "Application / next step"], ["prayer", "Prayer"],
    ["tone_wording", "Tone / wording"], ["other", "Other"],
  ];
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
