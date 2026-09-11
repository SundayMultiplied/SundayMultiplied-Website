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
    setSaving(true);
    setError("");
    setJob(null);
    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/production/import", { method: "POST", body: formData });
      const text = await response.text();
      let data: { error?: string; job?: ImportedJob } = {};
      try { data = JSON.parse(text) as typeof data; }
      catch { throw new Error(`The import service returned an unexpected response (HTTP ${response.status}).`); }
      if (!response.ok || !data.job) throw new Error(data.error || "Unable to import the manual production package.");
      setJob(data.job);
      event.currentTarget.reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to import the manual production package.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="approval-dashboard">
    <div className="approval-dashboard-head production-dashboard-head">
      <div>
        <p className="approval-kicker">Sunday Multiplied operations</p>
        <h1>Manual Production Import</h1>
        <p>Load a completed production package directly into the normal internal-review queue without running an OpenAI generation.</p>
      </div>
      <Link className="production-intake-toggle" href="/production">Back to Production</Link>
    </div>

    <section className="approval-create">
      <div className="approval-create-heading">
        <div>
          <h2>Import a review-ready ZIP</h2>
          <p>Upload the ZIP produced by the manual Sunday Multiplied workflow. The importer reads its packaged R2 manifest, transcript, Canonical Sermon Analysis v3, and final resource HTML automatically.</p>
        </div>
      </div>

      {error && <div className="approval-admin-error"><strong>Import unavailable</strong><p>{error}</p></div>}
      {job && <div className="approval-notice" role="status">
        <strong>Imported successfully.</strong> {job.churchName} · {job.metadata.sermonTitle || job.weekOf} is now in the Production queue and ready for internal review. <Link href="/production">Open Production</Link>
      </div>}

      <form id="manual-production-import-form" className="production-source-form" onSubmit={(event) => void submit(event)}>
        <label>Manual production package (.zip)
          <input name="package" type="file" accept=".zip,application/zip" required disabled={saving} />
        </label>

        <div className="approval-notice">
          <strong>No AI call is made.</strong> The importer derives the church and sermon date from the package and rejects malformed packages, blocked fidelity audits, church/date mismatches, missing subscribed resources, obsolete Family/Midweek formats, embedded Group midweek sections, invalid worship links, and duplicate church/date jobs.
        </div>

        <button type="submit" className="approval-approve" disabled={saving}>{saving ? "Validating and importing…" : "Import into Production"}</button>
      </form>
    </section>
  </main>;
}
