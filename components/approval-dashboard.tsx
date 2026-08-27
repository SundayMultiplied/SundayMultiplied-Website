"use client";

import { useEffect, useState } from "react";

type PackageSummary = {
  id: string;
  title: string;
  weekOf: string;
  status: string;
  updatedAt: string;
  churchName: string;
  resourceCount: number;
};

export function ApprovalDashboard() {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createdLink, setCreatedLink] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/approvals/api", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { error?: string; packages: PackageSummary[] };
        if (!response.ok) throw new Error(data.error || "Unable to load approval packages.");
        setPackages(data.packages);
      })
      .catch((failure: Error) => setError(failure.message));
  }, []);
  async function createPackage(formData: FormData) {
    setSaving(true);
    setError("");
    const resources = ["Monday", "Group", "Family"].map((kind) => ({
      kind,
      title: `${kind} Multiplied`,
      previewUrl: String(formData.get(`${kind.toLowerCase()}Url`) || ""),
    })).filter((item) => item.previewUrl);
    const response = await fetch("/approvals/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        churchName: formData.get("churchName"), title: formData.get("title"), seriesTitle: formData.get("seriesTitle"),
        weekOf: formData.get("weekOf"), scripture: formData.get("scripture"), resources,
      }),
    });
    const data = await response.json() as { error?: string; reviewUrl?: string };
    setSaving(false);
    if (!response.ok) return setError(data.error || "Unable to create this package.");
    if (data.reviewUrl) setCreatedLink(data.reviewUrl);
  }
  return (
    <main className="approval-dashboard">
      <div className="approval-dashboard-head"><div><p className="approval-kicker">Sunday Multiplied operations</p><h1>Approval packages</h1></div><button type="button" className="approval-approve" onClick={() => setShowCreate((value) => !value)}>{showCreate ? "Close" : "Create package"}</button></div>
      {showCreate && <form className="approval-create" action={(formData) => void createPackage(formData)}>
        <div className="approval-create-heading"><h2>New review package</h2><p>Create the secure review link after the final HTML or PDF URLs are ready.</p></div>
        <div className="approval-create-grid">
          <label>Church name<input name="churchName" required /></label><label>Week of<input name="weekOf" type="date" required /></label>
          <label>Package title<input name="title" required /></label><label>Series title<input name="seriesTitle" /></label>
          <label className="wide">Scripture<input name="scripture" /></label>
          <label>Monday resource URL<input name="mondayUrl" type="url" /></label><label>Group resource URL<input name="groupUrl" type="url" /></label><label>Family resource URL<input name="familyUrl" type="url" /></label>
        </div>
        <button className="approval-approve" disabled={saving}>{saving ? "Creating…" : "Create secure review"}</button>
        {createdLink && <div className="approval-created-link"><strong>Secure review link</strong><input readOnly value={createdLink} onFocus={(event) => event.currentTarget.select()} /><small>Copy this link now. Only its secure hash is stored.</small></div>}
      </form>}
      {error && <div className="approval-admin-error"><strong>Dashboard access unavailable</strong><p>{error}</p></div>}
      {!error && <div className="approval-table">
        <div className="approval-table-row approval-table-labels"><span>Church / Package</span><span>Week of</span><span>Resources</span><span>Status</span></div>
        {packages.map((item) => <div className="approval-table-row" key={item.id}><span><strong>{item.churchName}</strong><small>{item.title}</small></span><span>{item.weekOf}</span><span>{item.resourceCount}</span><span className={`approval-status status-${item.status}`}>{item.status.replaceAll("_", " ")}</span></div>)}
      </div>}
    </main>
  );
}
