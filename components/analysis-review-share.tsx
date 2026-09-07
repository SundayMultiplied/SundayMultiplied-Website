"use client";

import { useEffect, useState } from "react";
import type { CanonicalSermonAnalysis } from "../worker/sermon-analysis";
import { SermonAnalysisReview } from "./sermon-analysis-review";

type SharedJob = {
  id: string;
  churchName: string;
  weekOf: string;
  status: "awaiting_analysis_review" | "ready_for_internal_review" | "sent_for_approval";
};

export function AnalysisReviewShare({ token }: { token: string }) {
  const [analysis, setAnalysis] = useState<CanonicalSermonAnalysis | null>(null);
  const [job, setJob] = useState<SharedJob | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/analysis-reviews/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { error?: string; analysis?: CanonicalSermonAnalysis; job?: SharedJob };
        if (!response.ok || !body.analysis || !body.job) throw new Error(body.error || "Unable to load this sermon analysis.");
        setAnalysis(body.analysis);
        setJob(body.job);
      })
      .catch((failure: Error) => setError(failure.message));
  }, [token]);

  async function submitFeedback(formData: FormData) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/analysis-reviews/${encodeURIComponent(token)}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewerName: formData.get("reviewerName"),
          assessment: formData.get("assessment"),
          notes: formData.get("notes"),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to save your feedback.");
      setSubmitted(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save your feedback."); }
    finally { setSaving(false); }
  }

  if (error && !analysis) return <main className="analysis-share-page"><div className="analysis-share-error"><h1>Analysis unavailable</h1><p>{error}</p></div></main>;
  if (!analysis || !job) return <main className="analysis-share-page"><div className="analysis-share-loading">Loading sermon analysis…</div></main>;

  return <main className="analysis-share-page">
    <div className="analysis-share-shell">
      <header className="analysis-share-intro">
        <div><p className="approval-kicker">Sunday Multiplied · Sermon analysis</p><h1>Analysis review</h1><p>Please review how Sunday Multiplied understood the sermon before resources are created.</p></div>
        <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
      </header>
      <SermonAnalysisReview analysis={analysis} job={job} generating={false} onClose={() => undefined} onGenerate={() => undefined} publicView />
      {submitted ? <section className="analysis-feedback-thanks"><h2>Feedback received</h2><p>Thank you. Your response has been added to the internal sermon analysis review.</p></section> : <form className="analysis-feedback-form" onSubmit={(event) => { event.preventDefault(); void submitFeedback(new FormData(event.currentTarget)); }}>
        <div><p className="approval-kicker">Pastor feedback</p><h2>Does this accurately represent the sermon?</h2><p>Flag anything that could affect the resources generated from this analysis.</p></div>
        <label><span>Your name</span><input name="reviewerName" required maxLength={100} /></label>
        <fieldset><legend>Assessment</legend><label><input type="radio" name="assessment" value="accurate" required /><span>Looks accurate</span></label><label><input type="radio" name="assessment" value="questions" required /><span>I have questions</span></label><label><input type="radio" name="assessment" value="changes_requested" required /><span>Changes are needed</span></label></fieldset>
        <label><span>Comments</span><small>Required when asking questions or requesting changes.</small><textarea name="notes" rows={6} maxLength={4000} /></label>
        {error && <p className="analysis-feedback-error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving feedback…" : "Submit feedback"}</button>
      </form>}
    </div>
  </main>;
}
