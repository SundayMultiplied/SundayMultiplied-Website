"use client";

import { useEffect, useState } from "react";

type ReviewData = {
  id: string; churchName: string; weekOf: string; sermonTitle: string;
  variants: Array<{ label: "A" | "B" | "C"; resources: Array<{ kind: string; previewUrl: string }> }>;
};

export function ComparisonReview({ id }: { id: string }) {
  const [comparison, setComparison] = useState<ReviewData | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [preferred, setPreferred] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/comparison-reviews/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json() as { error?: string; comparison?: ReviewData }; if (!response.ok || !data.comparison) throw new Error(data.error || "Comparison unavailable."); setComparison(data.comparison); })
      .catch((failure: Error) => setError(failure.message));
  }, [id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const response = await fetch(`/api/comparison-reviews/${encodeURIComponent(id)}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewerName, preferred, notes }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to save your response.");
      setSaved(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save your response."); }
    finally { setSaving(false); }
  }

  if (error && !comparison) return <main className="comparison-review-page"><div className="comparison-review-shell"><h1>Comparison unavailable</h1><p>{error}</p></div></main>;
  if (!comparison) return <main className="comparison-review-page"><div className="comparison-review-shell"><p>Loading comparison…</p></div></main>;
  const kinds = comparison.variants[0]?.resources.map((item) => item.kind) || [];

  return <main className="comparison-review-page"><div className="comparison-review-shell">
    <header className="comparison-review-head"><p className="approval-kicker">Sunday Multiplied comparison</p><h1>{comparison.sermonTitle}</h1><p>{comparison.churchName} · {comparison.weekOf}</p><p className="comparison-review-instruction">Open the same resource in A, B, and C. The production versions are intentionally hidden so you can judge what feels clearest, most natural, and most useful.</p></header>
    {kinds.map((kind) => <section className="comparison-resource-row" key={kind}><h2>{titleCase(kind)} Multiplied</h2><div>{comparison.variants.map((variant) => { const resource = variant.resources.find((item) => item.kind === kind); return resource && <a key={variant.label} href={resource.previewUrl} target="_blank" rel="noreferrer"><span>Version</span><strong>{variant.label}</strong><small>Open resource</small></a>; })}</div></section>)}
    {saved ? <section className="comparison-thanks"><h2>Thank you.</h2><p>Your preference has been saved without revealing which production version you chose.</p></section> : <form className="comparison-feedback-form" onSubmit={(event) => void submit(event)}>
      <h2>Which version feels best overall?</h2><p>Think about voice, clarity, usefulness, and connection to the sermon.</p>
      <div className="comparison-choice-row">{(["A", "B", "C"] as const).map((label) => <label key={label}><input type="radio" name="preferred" value={label} checked={preferred === label} onChange={() => setPreferred(label)} required /><span>{label}</span></label>)}</div>
      <label><span>Your name <small>(optional)</small></span><input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} maxLength={100} /></label>
      <label><span>What stood out? <small>(optional)</small></span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={5} /></label>
      {error && <p className="comparison-form-error">{error}</p>}
      <button type="submit" disabled={saving}>{saving ? "Saving…" : "Submit preference"}</button>
    </form>}
  </div></main>;
}

function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
