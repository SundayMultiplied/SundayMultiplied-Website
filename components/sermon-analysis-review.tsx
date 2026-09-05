"use client";

import type { CanonicalSermonAnalysis } from "../worker/sermon-analysis";
import type { ReactNode } from "react";

type ReviewJob = {
  id: string;
  churchName: string;
  weekOf: string;
  status: "awaiting_analysis_review" | "ready_for_internal_review" | "sent_for_approval";
  sourceFiles?: Array<{ sourceId: string; sourceType: string; filename: string }>;
};

export function SermonAnalysisReview({
  analysis,
  job,
  generating,
  onClose,
  onGenerate,
}: {
  analysis: CanonicalSermonAnalysis;
  job: ReviewJob;
  generating: boolean;
  onClose: () => void;
  onGenerate: () => void;
}) {
  const blocked = analysis.source_quality.generation_disposition === "blocked" || analysis.fidelity_audit.result === "fail";
  const comparison = analysis.source_comparison;
  const reviewNotes = buildReviewNotes(analysis);

  return <section className="sermon-analysis-review" aria-labelledby="sermon-analysis-title">
    <header className="sermon-analysis-head">
      <div>
        <p className="approval-kicker">Analysis checkpoint</p>
        <h2 id="sermon-analysis-title">{analysis.sermon.sermon_title || "Sermon analysis"}</h2>
        <p>{job.churchName} · {job.weekOf}</p>
      </div>
      <div className="sermon-analysis-head-actions">
        <span className={`analysis-result analysis-result--${analysis.fidelity_audit.result}`}>{analysis.fidelity_audit.result.replaceAll("_", " ")}</span>
        <button type="button" className="teaching-source-reset" onClick={onClose}>Close analysis</button>
      </div>
    </header>

    <div className="analysis-metadata-grid">
      <AnalysisFact label="Speaker" value={analysis.sermon.speaker} />
      <AnalysisFact label="Series" value={analysis.sermon.series_title} />
      <AnalysisFact label="Primary Scripture" value={analysis.sermon.primary_passage} />
      <AnalysisFact label="Confidence" value={analysis.source_quality.overall} />
    </div>

    <div className="analysis-message-grid">
      <AnalysisStatement label="Central claim" value={analysis.central_claim.text} basis={analysis.central_claim.basis} />
      <AnalysisStatement label="Core tension" value={analysis.core_tension.text} basis={analysis.core_tension.basis} />
      <AnalysisStatement label="Primary response" value={analysis.primary_response.text} basis={analysis.primary_response.basis} />
    </div>

    <AnalysisSection title="Teaching sources">
      <ul className="analysis-source-list">
        {analysis.source_bundle.transcript && <SourceCard descriptor={analysis.source_bundle.transcript} job={job} />}
        {analysis.source_bundle.supplemental_sources.map((source) => <SourceCard key={source.source_id} descriptor={source} job={job} />)}
      </ul>
    </AnalysisSection>

    <AnalysisSection title="Sermon movements">
      <ol className="analysis-movement-list">
        {analysis.major_movements.map((movement) => <li key={movement.movement_id}>
          <div><strong>{movement.title}</strong><span>{movement.emphasis}</span></div>
          <p>{movement.summary}</p>
          {movement.pastor_stated_point && <blockquote>{movement.pastor_stated_point}</blockquote>}
        </li>)}
      </ol>
    </AnalysisSection>

    <AnalysisSection title="Memorable structure">
      {analysis.memorable_structure.length ? <div className="analysis-structure-list">{analysis.memorable_structure.map((item) => <article key={item.structure_id}>
        <div><strong>{item.label}</strong><span>{item.kind.replaceAll("_", " ")}</span></div>
        <p>{item.delivered_status.replaceAll("_", " ")}</p>
        <small>{item.use_in_resources ? "Approved for resource use" : "Excluded from resource use"}</small>
      </article>)}</div> : <p className="analysis-empty">No memorable framework was established.</p>}
    </AnalysisSection>

    <AnalysisSection title="Source comparison">
      <div className="analysis-comparison-grid">
        <ComparisonColumn title="Supported by transcript and notes" items={comparison.supported_by_both.map((item) => item.summary)} empty="No shared items recorded." />
        <ComparisonColumn title="Transcript only" items={comparison.transcript_only.map((item) => item.text)} empty="No transcript-only items recorded." />
        <ComparisonColumn title="Supporting materials only" items={comparison.notes_only_content.map((item) => `${item.summary} — ${item.use_in_resources.replaceAll("_", " ")}`)} empty="No notes-only material recorded." />
      </div>
      {(comparison.delivered_departures.length > 0 || comparison.source_conflicts.length > 0 || comparison.transcription_corrections.length > 0) && <div className="analysis-comparison-detail">
        <ComparisonColumn title="Delivered departures" items={comparison.delivered_departures.map((item) => `Planned: ${item.planned} Delivered: ${item.delivered}`)} empty="" />
        <ComparisonColumn title="Source conflicts" items={comparison.source_conflicts.map((item) => `${item.topic}: transcript followed over supporting material`)} empty="" />
        <ComparisonColumn title="Transcription corrections" items={comparison.transcription_corrections.map((item) => `${item.transcript_excerpt} → ${item.corrected_text}`)} empty="" />
      </div>}
    </AnalysisSection>

    <div className="analysis-content-grid">
      <AnalysisSection title="Applications">
        <ul>{analysis.applications.map((item) => <li key={item.application_id}><strong>{item.text}</strong><small>{item.classification} · {item.confidence} confidence</small></li>)}</ul>
      </AnalysisSection>
      <AnalysisSection title="References and illustrations">
        <ul>{analysis.references_and_illustrations.map((item) => <li key={item.entry_id}><strong>{item.reference_or_name}</strong><span>{item.how_used}</span></li>)}</ul>
      </AnalysisSection>
    </div>

    {reviewNotes.length > 0 && <AnalysisSection title="Review notes" tone="warning">
      <ul>
        {reviewNotes.map((item) => <li key={item.id}><span>{item.text}</span><small className="analysis-impact">Impact - {titleCase(item.impact)}</small></li>)}
      </ul>
    </AnalysisSection>}

    <footer className="analysis-review-actions">
      <div><strong>{blocked ? "Generation blocked" : job.status === "awaiting_analysis_review" ? "Ready for your decision" : "Analysis previously accepted"}</strong><span>{blocked ? "Correct the teaching sources and create a new analysis." : job.status === "awaiting_analysis_review" ? "Accepting this analysis makes it the source for every generated resource." : "You can review this record without regenerating the package."}</span></div>
      {job.status === "awaiting_analysis_review" && <button type="button" className="approval-approve" onClick={onGenerate} disabled={blocked || generating}>{generating ? "Generating resources…" : "Accept analysis & generate resources"}</button>}
    </footer>
  </section>;
}

function AnalysisFact({ label, value }: { label: string; value: string | null }) {
  return <div><small>{label}</small><strong>{value || "Not established"}</strong></div>;
}

function AnalysisStatement({ label, value, basis }: { label: string; value: string; basis: string }) {
  return <article><small>{label}</small><p>{value}</p><span>{basis.replaceAll("_", " ")}</span></article>;
}

function AnalysisSection({ title, tone, children }: { title: string; tone?: "warning"; children: ReactNode }) {
  return <section className={`analysis-section${tone ? ` analysis-section--${tone}` : ""}`}><h3>{title}</h3>{children}</section>;
}

function ComparisonColumn({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  if (!items.length && !empty) return null;
  return <article><h4>{title}</h4>{items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="analysis-empty">{empty}</p>}</article>;
}

function SourceCard({ descriptor, job }: { descriptor: CanonicalSermonAnalysis["source_bundle"]["supplemental_sources"][number]; job: ReviewJob }) {
  const storedSource = job.sourceFiles?.find((source) => source.sourceId === descriptor.source_id)
    || job.sourceFiles?.find((source) => source.filename === descriptor.name && source.sourceType === descriptor.source_type);
  const role = descriptor.role === "controlling" ? "controlling" : "supporting";
  return <li>
    <strong>{descriptor.name}</strong>
    <span>{descriptor.source_type.replaceAll("_", " ")} · {role}</span>
    {storedSource && <a href={`/api/production/jobs/${encodeURIComponent(job.id)}/sources/${encodeURIComponent(storedSource.sourceId)}`} target="_blank" rel="noreferrer">Open source file</a>}
  </li>;
}

function buildReviewNotes(analysis: CanonicalSermonAnalysis) {
  type Impact = CanonicalSermonAnalysis["uncertainties"][number]["impact"];
  const candidates: Array<{ id: string; text: string; impact: Impact }> = [
    ...analysis.uncertainties.map((item) => ({ id: item.uncertainty_id, text: item.description, impact: item.impact })),
    ...analysis.source_quality.material_issues.map((text, index) => ({ id: `issue-${index}`, text, impact: "minor" as const })),
    ...analysis.fidelity_audit.notes.map((text, index) => ({ id: `audit-${index}`, text, impact: "none" as const })),
  ];
  const seenTopics = new Set<string>();
  return candidates.filter((item) => {
    const topic = reviewNoteTopic(item.text);
    if (seenTopics.has(topic)) return false;
    seenTopics.add(topic);
    return true;
  });
}

function reviewNoteTopic(value: string) {
  const text = value.toLowerCase();
  if (/timestamp|speech[- ]recognition|recognition error|transcription/.test(text)) return "transcript-quality";
  if (/speaker/.test(text)) return "speaker-identity";
  if (/title|series/.test(text)) return "title-series";
  if (/transcript is controlling|transcript authority|supporting material/.test(text)) return "source-authority";
  if (/delivered points|major movements|gospel presentation/.test(text)) return "sermon-fidelity";
  return text.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 3).slice(0, 10).join(" ");
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
