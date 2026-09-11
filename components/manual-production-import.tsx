"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type ImportedJob = {
  id: string;
  churchName: string;
  weekOf: string;
  metadata: { sermonTitle: string };
};

export function ManualProductionImport() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<ImportedJob | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    setJob(null);
    try {
      const formData = new FormData(form);
      const response = await fetch("/api/production/import", { method: "POST", body: formData });
      const text = await response.text();
      let data: { error?: string; job?: ImportedJob } = {};
      try { data = JSON.parse(text) as typeof data; }
      catch { throw new Error(`The import service returned an unexpected response (HTTP ${response.status}).`); }
      if (!response.ok || !data.job) throw new Error(data.error || "Unable to import the manual production package.");
      form.reset();
      setJob(data.job);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to import the manual production package.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="approval-dashboard manual-import-page">
    <div className="approval-dashboard-head production-dashboard-head manual-import-hero">
      <div>
        <p className="approval-kicker">Sunday Multiplied operations</p>
        <h1>Manual Production Import</h1>
        <p>Load a completed production package directly into the normal internal-review queue without running an OpenAI generation.</p>
      </div>
      <Link className="manual-import-back" href="/production">← Back to Production</Link>
    </div>

    <section className="approval-create manual-import-card">
      <div className="approval-create-heading">
        <div>
          <h2>Import a review-ready ZIP</h2>
          <p>Upload the ZIP produced by the manual Sunday Multiplied workflow. The importer reads its packaged R2 manifest, transcript, Canonical Sermon Analysis v3, and final resource HTML automatically.</p>
        </div>
      </div>

      {error && <div className="approval-admin-error manual-import-message" role="alert"><strong>Import unavailable</strong><p>{error}</p></div>}
      {job && <div className="approval-notice manual-import-message manual-import-success" role="status">
        <strong>Imported successfully.</strong> {job.churchName} · {job.metadata.sermonTitle || job.weekOf} is now in the Production queue and ready for internal review. <Link href="/production">Open Production</Link>
      </div>}

      <form id="manual-production-import-form" className="manual-import-form" onSubmit={(event) => void submit(event)}>
        <div className="manual-import-upload">
          <label htmlFor="manual-production-package">Manual production package <span>.zip</span></label>
          <input id="manual-production-package" name="package" type="file" accept=".zip,application/zip" required disabled={saving} />
          <small>Select the review-ready ZIP created by the manual production workflow.</small>
        </div>

        <div className="approval-notice manual-import-info">
          <strong>No AI call is made.</strong> The importer derives the church and sermon date from the package and rejects malformed packages, blocked fidelity audits, church/date mismatches, missing subscribed resources, obsolete Family/Midweek formats, embedded Group midweek sections, invalid worship links, and duplicate church/date jobs.
        </div>

        <div className="manual-import-actions">
          <button type="submit" className="manual-import-submit" disabled={saving}>{saving ? "Validating and importing…" : "Import into Production"}</button>
        </div>
      </form>
    </section>
  </main>;
}
