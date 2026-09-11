"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type ChurchConfig = {
  slug: string;
  name: string;
  resources: Array<"monday" | "group" | "family" | "midweek">;
};

type ImportedJob = {
  id: string;
  churchName: string;
  weekOf: string;
  metadata: { sermonTitle: string };
};

const resourceLabels = {
  monday: "Monday Multiplied HTML",
  group: "Group Multiplied HTML",
  family: "Family Multiplied HTML",
  midweek: "Midweek Multiplied HTML",
} as const;

export function ManualProductionImport() {
  const [churches, setChurches] = useState<ChurchConfig[]>([]);
  const [churchSlug, setChurchSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<ImportedJob | null>(null);

  const selectedChurch = useMemo(() => churches.find((church) => church.slug === churchSlug), [churches, churchSlug]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/production/churches", { cache: "no-store" });
        const data = await response.json() as { error?: string; churches?: ChurchConfig[] };
        if (!response.ok) throw new Error(data.error || "Unable to load configured churches.");
        const configured = data.churches || [];
        setChurches(configured);
        if (configured.length === 1) setChurchSlug(configured[0].slug);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Unable to load configured churches.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
      setChurchSlug(data.job ? churches.find((church) => church.name === data.job?.churchName)?.slug || "" : "");
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
        <p>Load a completed sermon analysis and finished resources directly into Production without running an OpenAI generation.</p>
      </div>
      <Link className="production-intake-toggle" href="/production">Back to Production</Link>
    </div>

    <section className="approval-create">
      <div className="approval-create-heading">
        <div>
          <h2>Import a review-ready package</h2>
          <p>The importer validates the current Canonical Analysis v3 and resource HTML contracts before anything is written to production storage.</p>
        </div>
      </div>

      {error && <div className="approval-admin-error"><strong>Import unavailable</strong><p>{error}</p></div>}
      {job && <div className="approval-notice" role="status">
        <strong>Imported successfully.</strong> {job.churchName} · {job.metadata.sermonTitle || job.weekOf} is now in the Production queue and ready for internal review. <Link href="/production">Open Production</Link>
      </div>}

      <form id="manual-production-import-form" className="production-source-form" onSubmit={(event) => void submit(event)}>
        <div className="production-source-grid">
          <label>Church
            <select name="churchSlug" required disabled={loading || saving} value={churchSlug} onChange={(event) => setChurchSlug(event.target.value)}>
              <option value="">Choose a church</option>
              {churches.map((church) => <option key={church.slug} value={church.slug}>{church.name}</option>)}
            </select>
          </label>
          <label>Sermon date
            <input name="weekOf" type="date" required disabled={saving} />
          </label>
        </div>

        <div className="production-source-grid">
          <label>Saved transcript (.txt or .vtt)
            <input name="transcript" type="file" accept=".txt,.vtt,text/plain,text/vtt" required disabled={saving} />
          </label>
          <label>Canonical Sermon Analysis v3 (.json)
            <input name="analysis" type="file" accept=".json,application/json" required disabled={saving} />
          </label>
        </div>

        <div className="approval-create-heading">
          <div>
            <h3>Finished resource HTML</h3>
            <p>Upload every resource subscribed for the selected church. These files are stored exactly as supplied after contract validation.</p>
          </div>
        </div>

        <div className="production-source-grid">
          {(selectedChurch?.resources || ["monday", "group", "family", "midweek"]).map((kind) => <label key={kind}>{resourceLabels[kind]}
            <input name={kind} type="file" accept=".html,.htm,text/html" required={Boolean(selectedChurch?.resources.includes(kind))} disabled={saving} />
          </label>)}
        </div>

        <div className="approval-notice">
          <strong>No AI call is made.</strong> The importer rejects blocked fidelity audits, church/date mismatches, missing subscribed resources, old Family/Midweek formats, embedded Group midweek sections, and duplicate church/date jobs.
        </div>

        <button type="submit" className="approval-approve" disabled={saving || loading || !selectedChurch}>{saving ? "Validating and importing…" : "Import into Production"}</button>
      </form>
    </section>
  </main>;
}
