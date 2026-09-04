"use client";

import { useRef, useState } from "react";

export type TeachingSourceChurch = { slug: string; name: string };

type SourceInputProps = {
  accept: string;
  description: string;
  label: string;
  multiple?: boolean;
  name: string;
  required?: boolean;
};

function SourceInput({ accept, description, label, multiple = false, name, required = false }: SourceInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState("");

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setSelection("");
  }

  return <div className={`teaching-source-input${required ? " teaching-source-input--primary" : ""}`}>
    <label>
      <span className="approval-field-label">{label}{required ? " — required" : " — optional"}</span>
      <small>{description}</small>
      <input
        ref={inputRef}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        required={required}
        onChange={(event) => setSelection([...event.currentTarget.files || []].map((file) => file.name).join(", "))}
      />
    </label>
    {selection && <div className="teaching-source-selection"><span>{selection}</span><button type="button" onClick={clear}>Clear</button></div>}
  </div>;
}

export function TeachingSourcesForm({ churches, saving, onSubmit }: { churches: TeachingSourceChurch[]; saving: boolean; onSubmit: (formData: FormData) => void }) {
  const [resetVersion, setResetVersion] = useState(0);

  return <form
    className="approval-create production-create teaching-sources-form"
    onSubmit={(event) => {
      event.preventDefault();
      if (!saving) onSubmit(new FormData(event.currentTarget));
    }}
    onReset={() => setResetVersion((version) => version + 1)}
  >
    <div className="approval-create-heading">
      <div><p className="approval-kicker">Step 1 · Teaching sources</p><h2>Create weekly source bundle</h2></div>
    </div>

    <fieldset className="teaching-source-section">
      <legend>Sermon identity</legend>
      <div className="approval-create-grid">
        <label><span className="approval-field-label">Church</span><select name="churchSlug" required defaultValue=""><option value="" disabled>Select a church…</option>{churches.map((church) => <option value={church.slug} key={church.slug}>{church.name}</option>)}</select></label>
        <label><span className="approval-field-label">Sermon date</span><input name="weekOf" type="date" required /></label>
      </div>
    </fieldset>

    <fieldset className="teaching-source-section">
      <legend>Delivered sermon</legend>
      <SourceInput key={`transcript-${resetVersion}`} name="transcript" label="Sermon transcript" description="The source of truth for what was preached. TXT and VTT are supported." accept=".txt,.vtt,text/plain,text/vtt" required />
    </fieldset>

    <fieldset className="teaching-source-section">
      <legend>Supporting pastor materials</legend>
      <p className="teaching-source-help">TXT, DOCX, and text-based PDF files are extracted and compared separately, with their source identity intact.</p>
      <div className="teaching-source-grid">
        <SourceInput key={`pastor-notes-${resetVersion}`} name="pastorNotes" label="Pastor notes" description="Working notes used to prepare or deliver the message." accept=".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        <SourceInput key={`manuscript-${resetVersion}`} name="sermonManuscript" label="Sermon manuscript" description="A written manuscript or fuller prepared draft." accept=".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        <SourceInput key={`outline-${resetVersion}`} name="outline" label="Sermon outline" description="Point structure, alliteration, headings, or planned sequence." accept=".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        <SourceInput key={`supporting-${resetVersion}`} name="supportingDocuments" label="Other supporting documents" description="Additional teaching material supplied by the church." accept=".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple />
      </div>
    </fieldset>

    <fieldset className="teaching-source-section">
      <legend>Factual metadata overrides</legend>
      <p className="teaching-source-help">Leave these blank for automatic detection. Supplied values override detected metadata, but do not override sermon content.</p>
      <div className="approval-create-grid">
        <label><span className="approval-field-label">Speaker</span><input name="speaker" maxLength={160} /></label>
        <label><span className="approval-field-label">Primary Scripture</span><input name="primaryPassage" maxLength={160} placeholder="Example: Matthew 18:1–14" /></label>
        <label><span className="approval-field-label">Sermon title</span><input name="sermonTitle" maxLength={240} /></label>
        <label><span className="approval-field-label">Series title</span><input name="seriesTitle" maxLength={240} /></label>
      </div>
    </fieldset>

    <div className="teaching-source-actions">
      <button className="approval-approve" disabled={saving}>{saving ? "Creating source bundle…" : "Create source bundle and resources"}</button>
      <button className="teaching-source-reset" type="reset" disabled={saving}>Clear form</button>
    </div>
    {saving ? <div className="production-progress" role="status" aria-live="polite"><strong>Building the weekly source bundle</strong><span>Teaching sources are being extracted, analyzed, and turned into the resource package.</span></div> : <small>Scanned PDFs need searchable text. Run OCR first or upload a TXT/DOCX version.</small>}
  </form>;
}
