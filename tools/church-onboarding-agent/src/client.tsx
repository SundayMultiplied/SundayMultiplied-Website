import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useAgent } from "agents/react";
import type { BrandProfile, ChurchBasics, ChurchLink, OnboardingState, Reviewer, ResourceType } from "./types";
import { emptyState } from "./types";
import "./styles.css";

const steps = ["Church", "Sources", "Brand", "Approval", "Repository"];

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function App() {
  const agentName = useMemo(() => new URLSearchParams(location.search).get("church") || `draft-${crypto.randomUUID()}`, []);
  const [state, setState] = useState<OnboardingState>(emptyState());
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const brandDirty = useRef(false);
  const agent = useAgent<OnboardingState>({
    agent: "ChurchOnboardingAgent",
    name: agentName,
    onStateUpdate: (next) => setState((current) =>
      brandDirty.current ? { ...next, brand: current.brand } : next
    ),
  });
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("church")) history.replaceState(null, "", `?church=${agentName}`);
  }, [agentName]);
  const complete = useMemo(() => Object.values(state.checklist).filter(Boolean).length, [state.checklist]);

  async function run(action: () => Promise<unknown>, nextStep?: number) {
    setError("");
    setBusy(true);
    try {
      await action();
      if (nextStep !== undefined) setStep(nextStep);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const basics = state.basics;
  const setBasics = (patch: Partial<ChurchBasics>) => setState({ ...state, basics: { ...basics, ...patch } });
  const brand = state.brand;
  const setBrand = (patch: Partial<BrandProfile>) => {
    brandDirty.current = true;
    setState((current) => ({ ...current, brand: { ...current.brand, ...patch } }));
  };

  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">Sunday Multiplied · Internal</p><h1>Church onboarding</h1></div><div className="status"><strong>{complete}/6</strong><span>setup checks</span></div></header>
    <nav aria-label="Onboarding steps">{steps.map((label, index) => <button className={index === step ? "active" : ""} onClick={() => setStep(index)} key={label}><b>0{index + 1}</b>{label}</button>)}</nav>
    {error && <div className="error" role="alert">{error}</div>}

    <section className="card">
      {step === 0 && <><p className="eyebrow">Identity</p><h2>Start with the church</h2><p className="lede">Use the canonical public name. The slug becomes its permanent repository and resource identifier.</p><div className="grid"><Field label="Church name" value={basics.name} onChange={(name) => setBasics({ name, slug: basics.slug === "" || basics.slug === slugify(basics.name) ? slugify(name) : basics.slug })} /><Field label="Church slug" value={basics.slug} onChange={(slug) => setBasics({ slug: slugify(slug) })} /><Field label="Website" type="url" placeholder="https://" value={basics.website} onChange={(website) => setBasics({ website })} /><Field label="City" value={basics.city} onChange={(city) => setBasics({ city })} /><Field label="State" value={basics.state} onChange={(stateName) => setBasics({ state: stateName })} /><Field label="Timezone" value={basics.timezone} onChange={(timezone) => setBasics({ timezone })} /></div><footer><button className="primary" disabled={busy} onClick={() => run(() => agent.stub.saveBasics(basics), 1)}>Save and research</button></footer></>}

      {step === 1 && <Sources state={state} setState={setState} busy={busy} research={() => run(() => agent.stub.researchWebsite())} save={() => run(() => agent.stub.saveLinks(state.links), 2)} />}
      {step === 2 && <><p className="eyebrow">Visual system</p><h2>Confirm the church style sheet</h2><p className="lede">Review the automated recommendations against the church’s current logo and social graphics. Your confirmed choices generate the production override and print rules.</p><div className="brand-workspace"><div><div className="colors">{(["primaryColor", "secondaryColor", "accentColor", "backgroundColor", "textColor"] as const).map((key) => <Field key={key} label={key.replace("Color", " color")} type="color" value={brand[key]} onChange={(value) => setBrand({ [key]: value })} />)}</div><div className="grid"><Field label="Heading font stack" value={brand.headingFont} onChange={(headingFont) => setBrand({ headingFont })} /><Field label="Body font stack" value={brand.bodyFont} onChange={(bodyFont) => setBrand({ bodyFont })} /><Field label="Corner radius" value={brand.cornerRadius} onChange={(cornerRadius) => setBrand({ cornerRadius })} /><label><span>Button style</span><select value={brand.buttonStyle} onChange={(event) => setBrand({ buttonStyle: event.target.value as BrandProfile["buttonStyle"] })}><option value="square">Square</option><option value="soft">Soft corners</option><option value="rounded">Rounded</option></select></label><Field label="Visual tone" value={brand.visualTone} onChange={(visualTone) => setBrand({ visualTone })} /></div><label><span>Visual notes and logo guidance</span><textarea value={brand.visualNotes} onChange={(event) => setBrand({ visualNotes: event.target.value })} /></label></div><ResourcePreview churchName={basics.name} brand={brand} /></div><LogoUploads state={state} agentName={agentName} setError={setError} /><footer><button className="primary" disabled={busy} onClick={() => run(async () => { await agent.stub.saveBrand(brand); brandDirty.current = false; }, 3)}>Approve brand and generate CSS</button></footer></>}

      {step === 3 && <Approval state={state} setState={setState} busy={busy} save={() => run(() => agent.stub.saveApproval(state.reviewers, state.resources, state.deliveryDay), 4)} />}
      {step === 4 && <><p className="eyebrow">Repository handoff</p><h2>Create the church workspace</h2><p className="lede">The agent will open a reviewable branch and pull request. It never writes directly to main.</p><ul className="tree"><li>churches/{basics.slug || "church-slug"}/church.json</li><li>churches/{basics.slug || "church-slug"}/brand/source-notes.md</li><li>churches/{basics.slug || "church-slug"}/styles/{basics.slug || "church-slug"}.css</li><li>churches/{basics.slug || "church-slug"}/sources/streaming.json</li><li>churches/{basics.slug || "church-slug"}/resources/YYYY/YYYY-MM-DD/…</li></ul>{state.github ? <a className="primary link" href={state.github.pullRequestUrl} target="_blank" rel="noreferrer">Open pull request</a> : <footer><button className="primary" disabled={busy} onClick={() => run(() => agent.stub.createGitHubPullRequest())}>Create GitHub pull request</button></footer>}</>}
    </section>
  </main>;
}

function LogoUploads({ state, agentName, setError }: { state: OnboardingState; agentName: string; setError: (error: string) => void }) {
  async function upload(kind: "primary" | "reverse" | "mark", file?: File) {
    if (!file) return;
    setError("");
    const response = await fetch(`/agents/church-onboarding-agent/${agentName}`, {
      method: "POST",
      headers: { "content-type": file.type, "x-file-name": file.name, "x-asset-kind": kind },
      body: file,
    });
    if (!response.ok) setError(await response.text());
  }
  return <div className="upload-note"><strong>Logo files</strong><span>Upload source-quality variants. Files stay private and the church manifest stores their references.</span><div className="logo-grid">{(["primary", "reverse", "mark"] as const).map((kind) => { const saved = state.assets.find((asset) => asset.kind === kind); return <label key={kind}><span>{kind[0].toUpperCase() + kind.slice(1)} logo {saved ? `✓ ${saved.filename}` : ""}</span><input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={(event) => upload(kind, event.target.files?.[0])} /></label>; })}</div></div>;
}

function Sources({ state, setState, busy, research, save }: { state: OnboardingState; setState: (state: OnboardingState) => void; busy: boolean; research: () => void; save: () => void }) {
  const add = () => setState({ ...state, links: [...state.links, { kind: "other", label: "", url: "" }] });
  const update = (index: number, patch: Partial<ChurchLink>) => setState({ ...state, links: state.links.map((link, i) => i === index ? { ...link, ...patch } : link) });
  return <><p className="eyebrow">Public sources</p><h2>Find the weekly inputs and brand system</h2><p className="lede">Research reviews the homepage plus key ministry pages and stylesheets, then suggests source links, colors, fonts, shape language, and accessibility checks for your confirmation.</p><button className="secondary" disabled={busy || !state.basics.website} onClick={research}>{busy ? "Inspecting pages…" : "Inspect website and brand"}</button>{state.brandAnalysis && <BrandResearch state={state} />}<div className="links">{state.links.map((link, index) => <div className="link-row" key={`${index}-${link.kind}`}><select value={link.kind} onChange={(event) => update(index, { kind: event.target.value as ChurchLink["kind"] })}><option value="sermon_archive">Sermon archive</option><option value="youtube">YouTube</option><option value="facebook">Facebook</option><option value="vimeo">Vimeo</option><option value="podcast">Podcast</option><option value="church_center">Church Center</option><option value="instagram">Instagram</option><option value="other">Other</option></select><input aria-label="Label" placeholder="Label" value={link.label} onChange={(event) => update(index, { label: event.target.value })} /><input aria-label="URL" type="url" placeholder="https://" value={link.url} onChange={(event) => update(index, { url: event.target.value })} /></div>)}</div><button className="text" onClick={add}>+ Add another source</button><footer><button className="primary" disabled={busy} onClick={save}>Confirm research and sources</button></footer></>;
}

function BrandResearch({ state }: { state: OnboardingState }) {
  const analysis = state.brandAnalysis!;
  return <section className="research-summary"><div className="research-stats"><strong>{analysis.pagesAnalyzed.length}</strong><span>pages</span><strong>{analysis.stylesheetsAnalyzed.length}</strong><span>stylesheets</span><strong>{analysis.colorCandidates.length}</strong><span>colors</span></div><div className="swatches" aria-label="Detected color candidates">{analysis.colorCandidates.slice(0, 8).map((candidate) => <span key={candidate.value} title={`${candidate.value} · ${candidate.occurrences} uses`} style={{ backgroundColor: candidate.value }} />)}</div><div className="analysis-grid"><div><b>Suggested fonts</b><p>{analysis.fontCandidates.slice(0, 3).map((font) => font.value).join(" · ") || "Manual confirmation needed"}</p></div><div><b>Accessibility</b><p>{analysis.contrastChecks.map((check) => `${check.label}: ${check.ratio}:1 ${check.level === "pass" ? "✓" : "review"}`).join(" · ")}</p></div></div>{analysis.warnings.length > 0 && <ul className="warnings">{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}<p className="research-note">Automated findings are recommendations. Confirm them against current logo files and recent social graphics before approving the brand.</p></section>;
}

function ResourcePreview({ churchName, brand }: { churchName: string; brand: BrandProfile }) {
  const radius = brand.buttonStyle === "rounded" ? "999px" : brand.buttonStyle === "square" ? "0" : brand.cornerRadius;
  return <aside className="resource-preview" style={{ color: brand.textColor, background: brand.backgroundColor, borderColor: brand.secondaryColor, borderRadius: brand.cornerRadius, fontFamily: brand.bodyFont }}><span style={{ color: brand.accentColor }}>MONDAY MULTIPLIED</span><h3 style={{ color: brand.primaryColor, fontFamily: brand.headingFont }}>Carry Sunday into Monday</h3><p>A preview of how the confirmed church brand will shape every weekly resource.</p><div style={{ borderColor: brand.secondaryColor, borderRadius: brand.cornerRadius }}><b style={{ color: brand.primaryColor }}>Big Idea</b><p>God’s truth moves with us into ordinary life.</p></div><button type="button" style={{ color: "#fff", background: brand.primaryColor, borderRadius: radius }}>Preview resource</button><small>{churchName || "Church name"}</small></aside>;
}

function Approval({ state, setState, busy, save }: { state: OnboardingState; setState: (state: OnboardingState) => void; busy: boolean; save: () => void }) {
  const reviewer = state.reviewers[0] || { name: "", email: "", role: "" };
  const setReviewer = (patch: Partial<Reviewer>) => setState({ ...state, reviewers: [{ ...reviewer, ...patch }] });
  const toggle = (resource: ResourceType) => setState({ ...state, resources: state.resources.includes(resource) ? state.resources.filter((item) => item !== resource) : [...state.resources, resource] });
  return <><p className="eyebrow">Approval</p><h2>Choose who signs off</h2><p className="lede">This reviewer receives one secure link with Preview buttons, Approve all, and separate feedback for each selected resource.</p><div className="grid"><Field label="Reviewer name" value={reviewer.name} onChange={(name) => setReviewer({ name })} /><Field label="Reviewer email" type="email" value={reviewer.email} onChange={(email) => setReviewer({ email })} /><Field label="Role" value={reviewer.role} onChange={(role) => setReviewer({ role })} /><Field label="Target delivery day" value={state.deliveryDay} onChange={(deliveryDay) => setState({ ...state, deliveryDay })} /></div><fieldset><legend>Weekly resources</legend>{(["monday", "group", "family"] as ResourceType[]).map((resource) => <label className="check" key={resource}><input type="checkbox" checked={state.resources.includes(resource)} onChange={() => toggle(resource)} />{resource[0].toUpperCase() + resource.slice(1)} Multiplied</label>)}</fieldset><footer><button className="primary" disabled={busy} onClick={save}>Confirm approval setup</button></footer></>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
