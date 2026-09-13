"use client";

import { useEffect, useState } from "react";
import styles from "./family-worship-override.module.css";

type WorshipState = {
  resourceId: string;
  active: boolean;
  recommendedUrl: string;
  recommendedLabel: string;
  selectedUrl: string;
  selectedLabel: string;
  canEdit: boolean;
};

type Props = {
  token: string;
  resourceId: string;
  disabled?: boolean;
};

export function FamilyWorshipOverride({ token, resourceId, disabled = false }: Props) {
  const [state, setState] = useState<WorshipState | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const endpoint = `/api/reviews/${encodeURIComponent(token)}/resource/${encodeURIComponent(resourceId)}/worship`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as WorshipState & { error?: string };
        if (!response.ok) throw new Error(body.error || "Unable to load the worship-song options.");
        if (!cancelled) {
          setState(body);
          setUrl(body.selectedUrl || "");
        }
      })
      .catch((failure: Error) => !cancelled && setError(failure.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [endpoint]);

  async function applyOverride() {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await response.json() as WorshipState & { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to update the worship song.");
      setState(body);
      setUrl(body.selectedUrl || "");
      setMessage("Family Multiplied has been updated. Reopen the resource to see the selected song.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to update the worship song.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreRecommendation() {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const body = await response.json() as WorshipState & { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to restore the recommended song.");
      setState(body);
      setUrl("");
      setMessage("The Sunday Multiplied recommendation has been restored.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to restore the recommended song.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.panel} role="status">Loading worship-song options…</div>;
  if (error && !state) return <div className={styles.panel}><strong>Worship song</strong><p className={styles.error}>{error}</p></div>;
  if (!state?.recommendedUrl) return null;

  const locked = disabled || !state.canEdit;

  return (
    <section className={styles.panel} aria-label="Family Multiplied worship song">
      <div className={styles.heading}>
        <div>
          <span>Family Multiplied</span>
          <strong>Worship Song</strong>
        </div>
        {state.active && <span className={styles.badge}>Pastor-selected</span>}
      </div>

      <div className={styles.recommendation}>
        <span>Sunday Multiplied recommends</span>
        <strong>{state.recommendedLabel}</strong>
        <a href={state.recommendedUrl} target="_blank" rel="noreferrer">Open recommendation ↗</a>
      </div>

      {state.active && (
        <div className={styles.selected}>
          <span>Currently using</span>
          <strong>{state.selectedLabel || "Pastor-selected worship song"}</strong>
          <a href={state.selectedUrl} target="_blank" rel="noreferrer">Open selected song ↗</a>
        </div>
      )}

      {!locked ? (
        <div className={styles.controls}>
          <label htmlFor={`family-worship-${resourceId}`}>{state.active ? "Choose a different YouTube song" : "Prefer a different song? Paste its YouTube link."}</label>
          <div className={styles.inputRow}>
            <input
              id={`family-worship-${resourceId}`}
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={saving}
            />
            <button type="button" onClick={() => void applyOverride()} disabled={saving || !url.trim()}>
              {saving ? "Saving…" : state.active ? "Use this song" : "Replace song"}
            </button>
          </div>
          <p className={styles.help}>This changes only the Family Multiplied worship song. It does not count as a revision request or change the rest of the resource.</p>
          {state.active && <button type="button" className={styles.restore} onClick={() => void restoreRecommendation()} disabled={saving}>Restore Sunday Multiplied recommendation</button>}
        </div>
      ) : (
        <p className={styles.help}>The worship selection is locked because this resource already has a recorded decision.</p>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p className={styles.success} role="status">{message}</p>}
    </section>
  );
}
