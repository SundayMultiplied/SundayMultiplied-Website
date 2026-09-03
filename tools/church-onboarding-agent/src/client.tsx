import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useAgent } from "agents/react";
import type { BrandProfile, ChurchBasics, ChurchLink, OnboardingState, Reviewer, ResourceType, ResolvedBrandProfile } from "./types";
import { emptyState, normalizeBrandProfile } from "./types";
import "./styles.css";

const steps = ["Church", "Sources", "Brand", "Approval", "Repository"];
const FONT_OPTIONS = [
  ["Classic Serif", "Georgia, 'Times New Roman', serif"],
  ["Modern Sans", "Arial, Helvetica, sans-serif"],
  ["Humanist Sans", "'Avenir Next', 'Helvetica Neue', Arial, sans-serif"],
  ["Editorial Serif", "'Palatino Linotype', Palatino, Georgia, serif"],
  ["Clean UI", "Inter, Arial, sans-serif"],
  ["Montserrat-style", "Montserrat, 'Avenir Next', Arial, sans-serif"],
];

function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}
function SelectField<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: Array<[string, T]> }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value as T)}>{options.map(([name, option]) => <option value={option} key={option}>{name}</option>)}</select></label>;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="color-field"><span>{label}</span><div><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><input value={value} onChange={(event) => onChange(event.target.value)} /></div></label>;
}
function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function App() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  if (params.get("mode") === "theme") return <StandaloneThemeEditor initialSlug={params.get("church") || ""} />;
  return <OnboardingApp />;
}

function OnboardingApp() {
  const agentName = useMemo(() => new URLSearchParams(location.search).get("church") || `draft-${crypto.randomUUID()}`, []);
  const [state, setState] = useState<OnboardingState>(emptyState());
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const brandDirty = useRef(false);
  const agent = useAgent<OnboardingState>({
    agent: "ChurchOnboardingAgent",
    name: agentName,
    onStateUpdate: (next) => setState((current) => brandDirty.current ? { ...next, brand: current.brand } : { ...next, brand: normalizeBrandProfile(next.brand) }),
  });
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("church")) history.replaceState(null, "", `?church=${agentName}`);
  }, [agentName]);
  const complete = useMemo(() => Object.values(state.checklist).filter(Boolean).length, [state.checklist]);
  async function run(action: () => Promise<unknown>, nextStep?: number) {
    setError(""); setBusy(true);
    try { await action(); if (nextStep !== undefined) setStep(nextStep); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  async function resetOnboarding() {
    const completed = Boolean(state.github);
    if (!window.confirm(completed ? "Start a new church draft? This completed onboarding record and its uploaded assets will be preserved." : "Reset this onboarding form? This clears the saved draft and deletes its uploaded logos.")) return;
    if (completed) { location.assign(`?church=draft-${crypto.randomUUID()}`); return; }
    await run(async () => { const reset = await agent.stub.resetOnboarding(); brandDirty.current = false; setState(reset); setStep(0); });
  }
  const basics = state.basics;
  const setBasics = (patch: Partial<ChurchBasics>) => setState({ ...state, basics: { ...basics, ...patch } });
  const brand = normalizeBrandProfile(state.brand);
  const setBrand = (patch: Partial<BrandProfile>) => {
    brandDirty.current = true;
    setState((current) => ({ ...current, brand: { ...normalizeBrandProfile(current.brand), ...patch } }));
  };
  const previewLogo = basics.slug ? `/theme-assets/${basics.slug}/logo` : "";

  return <main className={step === 2 ? "shell shell--theme" : "shell"}>
    <header className="topbar"><div><p className="eyebrow">Sunday Multiplied · Internal</p><h1>Church onboarding</h1></div><div className="topbar-actions"><a className="secondary link" href="?mode=theme">Open Theme Editor</a><div className="status"><strong>{complete}/6</strong><span>setup checks</span></div><button className="secondary reset" type="button" disabled={busy} onClick={resetOnboarding}>{state.github ? "New church" : "Reset form"}</button></div></header>
    <nav aria-label="Onboarding steps">{steps.map((label, index) => <button className={index === step ? "active" : ""} onClick={() => setStep(index)} key={label}><b>0{index + 1}</b>{label}</button>)}</nav>
    {error && <div className="error" role="alert">{error}</div>}
    <section className={step === 2 ? "card card--theme" : "card"}>
      {step === 0 && <><p className="eyebrow">Identity</p><h2>Start with the church</h2><p className="lede">Use the canonical public name. The slug becomes its permanent repository and resource identifier.</p><div className="grid"><Field label="Church name" value={basics.name} onChange={(name) => setBasics({ name, slug: basics.slug === "" || basics.slug === slugify(basics.name) ? slugify(name) : basics.slug })} /><Field label="Church slug" value={basics.slug} onChange={(slug) => setBasics({ slug: slugify(slug) })} /><Field label="Website" type="url" placeholder="https://" value={basics.website} onChange={(website) => setBasics({ website })} /><Field label="City" value={basics.city} onChange={(city) => setBasics({ city })} /><Field label="State" value={basics.state} onChange={(stateName) => setBasics({ state: stateName })} /><Field label="Timezone" value={basics.timezone} onChange={(timezone) => setBasics({ timezone })} /></div><footer><button className="primary" disabled={busy} onClick={() => run(() => agent.stub.saveBasics(basics), 1)}>Save and research</button></footer></>}
      {step === 1 && <Sources state={state} setState={setState} busy={busy} research={() => run(() => agent.stub.researchWebsite())} save={() => run(() => agent.stub.saveLinks(state.links), 2)} />}
      {step === 2 && <><div className="theme-heading"><div><p className="eyebrow">Visual system</p><h2>Build the complete resource theme</h2><p className="lede">Edit the visual system on the left. The full-size resource canvas on the right updates instantly and represents the same design tokens used to generate production CSS.</p></div></div><ThemeEditor brand={brand} setBrand={setBrand} churchName={basics.name || "Church Name"} logoUrl={previewLogo} /><LogoUploads state={state} agentName={agentName} agent={agent} setError={setError} /><footer><button className="primary" disabled={busy} onClick={() => run(async () => { await agent.stub.saveBrand(brand); brandDirty.current = false; }, 3)}>Approve theme and generate CSS</button></footer></>}
      {step === 3 && <Approval state={state} setState={setState} busy={busy} save={() => run(() => agent.stub.saveApproval(state.reviewers, state.resources, state.deliveryDay), 4)} />}
      {step === 4 && <><p className="eyebrow">Repository handoff</p><h2>Create the church workspace</h2><p className="lede">The agent will open a reviewable branch and pull request. It never writes directly to main.</p><ul className="tree"><li>churches/{basics.slug || "church-slug"}/church.json</li><li>churches/{basics.slug || "church-slug"}/brand/source-notes.md</li><li>churches/{basics.slug || "church-slug"}/styles/{basics.slug || "church-slug"}.css</li><li>churches/{basics.slug || "church-slug"}/sources/streaming.json</li><li>churches/{basics.slug || "church-slug"}/resources/YYYY/YYYY-MM-DD/…</li></ul>{state.github ? <a className="primary link" href={state.github.pullRequestUrl} target="_blank" rel="noreferrer">Open pull request</a> : <footer><button className="primary" disabled={busy} onClick={() => run(() => agent.stub.createGitHubPullRequest())}>Create GitHub pull request</button></footer>}</>}
    </section>
  </main>;
}

function StandaloneThemeEditor({ initialSlug }: { initialSlug: string }) {
  const [slug, setSlug] = useState(initialSlug);
  const [churchName, setChurchName] = useState("Church Name");
  const [brand, setBrandState] = useState<ResolvedBrandProfile>(normalizeBrandProfile());
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pullRequestUrl, setPullRequestUrl] = useState("");
  const agent = useAgent<OnboardingState>({ agent: "ChurchOnboardingAgent", name: "theme-editor" });
  const setBrand = (patch: Partial<BrandProfile>) => setBrandState((current) => normalizeBrandProfile({ ...current, ...patch }));
  async function load() {
    setBusy(true); setError(""); setPullRequestUrl("");
    try {
      const result = await agent.stub.loadExistingTheme(slugify(slug));
      setSlug(result.slug); setChurchName(result.churchName); setBrandState(normalizeBrandProfile(result.brand)); setLogoUrl(`/theme-assets/${result.slug}/logo`);
      history.replaceState(null, "", `?mode=theme&church=${result.slug}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load this church theme."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try { const result = await agent.stub.createThemePullRequest(slug, brand); setPullRequestUrl(result.pullRequestUrl); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create the theme update."); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (initialSlug) void load(); }, []);
  return <main className="shell shell--theme standalone-theme">
    <header className="topbar"><div><p className="eyebrow">Sunday Multiplied · Internal</p><h1>Theme Editor</h1><p className="lede">Edit an existing church resource theme without touching CSS.</p></div><div className="topbar-actions"><a className="secondary link" href="/">Back to onboarding</a></div></header>
    {error && <div className="error" role="alert">{error}</div>}
    <section className="theme-loader"><Field label="Church slug" value={slug} onChange={(value) => setSlug(slugify(value))} /><button className="secondary" disabled={busy || !slug} onClick={load}>{busy ? "Loading…" : "Load church theme"}</button>{churchName !== "Church Name" && <strong>{churchName}</strong>}</section>
    <section className="card card--theme"><ThemeEditor brand={brand} setBrand={setBrand} churchName={churchName} logoUrl={logoUrl} /><footer className="theme-save"><button className="primary" disabled={busy || churchName === "Church Name"} onClick={save}>{busy ? "Working…" : `Create ${churchName} Theme Update PR`}</button>{pullRequestUrl && <a className="secondary link" target="_blank" rel="noreferrer" href={pullRequestUrl}>Open pull request</a>}</footer></section>
  </main>;
}

function ThemeEditor({ brand, setBrand, churchName, logoUrl }: { brand: ResolvedBrandProfile; setBrand: (patch: Partial<BrandProfile>) => void; churchName: string; logoUrl?: string }) {
  return <div className="visual-theme-editor">
    <aside className="theme-controls">
      <ControlGroup title="Brand colors">
        <ColorField label="Primary" value={brand.primaryColor} onChange={(primaryColor) => setBrand({ primaryColor })} />
        <ColorField label="Secondary" value={brand.secondaryColor} onChange={(secondaryColor) => setBrand({ secondaryColor })} />
        <ColorField label="Accent" value={brand.accentColor} onChange={(accentColor) => setBrand({ accentColor })} />
        <ColorField label="Page background" value={brand.backgroundColor} onChange={(backgroundColor) => setBrand({ backgroundColor })} />
        <ColorField label="Body text" value={brand.textColor} onChange={(textColor) => setBrand({ textColor })} />
        <ColorField label="Muted text" value={brand.mutedColor} onChange={(mutedColor) => setBrand({ mutedColor })} />
        <ColorField label="Borders" value={brand.borderColor} onChange={(borderColor) => setBrand({ borderColor })} />
      </ControlGroup>
      <ControlGroup title="Header & logo">
        <SelectField label="Header style" value={brand.headerStyle} onChange={(headerStyle) => setBrand({ headerStyle })} options={[["White / plain", "plain"], ["Filled color", "filled"], ["Split / branded", "split"]]} />
        <ColorField label="Header background" value={brand.headerBackgroundColor} onChange={(headerBackgroundColor) => setBrand({ headerBackgroundColor })} />
        <ColorField label="Header text" value={brand.headerTextColor} onChange={(headerTextColor) => setBrand({ headerTextColor })} />
        <SelectField label="Logo position" value={brand.logoPosition} onChange={(logoPosition) => setBrand({ logoPosition })} options={[["Right", "right"], ["Left", "left"]]} />
        <SelectField label="Logo size" value={brand.logoSize} onChange={(logoSize) => setBrand({ logoSize })} options={[["Small", "small"], ["Medium", "medium"], ["Large", "large"]]} />
        <CheckboxField label="Remove white logo background" checked={brand.removeLogoBackground} onChange={(removeLogoBackground) => setBrand({ removeLogoBackground })} />
      </ControlGroup>
      <ControlGroup title="Typography">
        <FontField label="Heading font" value={brand.headingFont} onChange={(headingFont) => setBrand({ headingFont })} />
        <FontField label="Body font" value={brand.bodyFont} onChange={(bodyFont) => setBrand({ bodyFont })} />
        <SelectField label="Heading weight" value={brand.headingWeight} onChange={(headingWeight) => setBrand({ headingWeight })} options={[["Semibold", "600"], ["Bold", "700"], ["Extra bold", "800"]]} />
        <SelectField label="Heading case" value={brand.headingTransform} onChange={(headingTransform) => setBrand({ headingTransform })} options={[["Normal", "none"], ["Uppercase", "uppercase"]]} />
      </ControlGroup>
      <ControlGroup title="Cards & sections">
        <ColorField label="Section background" value={brand.sectionBackgroundColor} onChange={(sectionBackgroundColor) => setBrand({ sectionBackgroundColor })} />
        <ColorField label="Section text" value={brand.sectionTextColor} onChange={(sectionTextColor) => setBrand({ sectionTextColor })} />
        <ColorField label="Callout background" value={brand.calloutBackgroundColor} onChange={(calloutBackgroundColor) => setBrand({ calloutBackgroundColor })} />
        <ColorField label="Callout text" value={brand.calloutTextColor} onChange={(calloutTextColor) => setBrand({ calloutTextColor })} />
        <SelectField label="Card treatment" value={brand.cardStyle} onChange={(cardStyle) => setBrand({ cardStyle })} options={[["Soft fill", "soft"], ["Border only", "bordered"], ["Flat", "flat"]]} />
        <Field label="Corner radius" value={brand.cornerRadius} onChange={(cornerRadius) => setBrand({ cornerRadius })} />
        <SelectField label="Button style" value={brand.buttonStyle} onChange={(buttonStyle) => setBrand({ buttonStyle })} options={[["Square", "square"], ["Soft corners", "soft"], ["Pill / rounded", "rounded"]]} />
      </ControlGroup>
      <ControlGroup title="Content blocks">
        <ColorField label="Scripture background" value={brand.scriptureBackgroundColor} onChange={(scriptureBackgroundColor) => setBrand({ scriptureBackgroundColor })} />
        <ColorField label="Scripture text" value={brand.scriptureTextColor} onChange={(scriptureTextColor) => setBrand({ scriptureTextColor })} />
        <ColorField label="Questions background" value={brand.questionBackgroundColor} onChange={(questionBackgroundColor) => setBrand({ questionBackgroundColor })} />
        <ColorField label="Questions text" value={brand.questionTextColor} onChange={(questionTextColor) => setBrand({ questionTextColor })} />
        <ColorField label="Prayer background" value={brand.prayerBackgroundColor} onChange={(prayerBackgroundColor) => setBrand({ prayerBackgroundColor })} />
        <ColorField label="Prayer text" value={brand.prayerTextColor} onChange={(prayerTextColor) => setBrand({ prayerTextColor })} />
      </ControlGroup>
      <ControlGroup title="Layout">
        <Field label="Resource width" value={brand.pageWidth} onChange={(pageWidth) => setBrand({ pageWidth })} />
        <Field label="Page padding" value={brand.pagePadding} onChange={(pagePadding) => setBrand({ pagePadding })} />
        <Field label="Section spacing" value={brand.sectionSpacing} onChange={(sectionSpacing) => setBrand({ sectionSpacing })} />
      </ControlGroup>
    </aside>
    <ResourceCanvas churchName={churchName} brand={brand} logoUrl={logoUrl} />
  </div>;
}

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) { return <section className="control-group"><h3>{title}</h3><div className="control-grid">{children}</div></section>; }
function FontField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><select value={FONT_OPTIONS.some(([, font]) => font === value) ? value : "custom"} onChange={(event) => event.target.value !== "custom" && onChange(event.target.value)}>{FONT_OPTIONS.map(([name, font]) => <option value={font} key={font}>{name}</option>)}<option value="custom">Custom stack…</option></select><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ResourceCanvas({ churchName, brand, logoUrl }: { churchName: string; brand: ResolvedBrandProfile; logoUrl?: string }) {
  const srcDoc = useMemo(() => buildPreviewDocument(churchName, brand, logoUrl), [churchName, brand, logoUrl]);
  return <div className="resource-canvas-wrap"><div className="canvas-toolbar"><strong>Full resource preview</strong><span>Group Multiplied · sample content</span></div><iframe title="Live resource theme preview" className="resource-canvas" srcDoc={srcDoc} /></div>;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!)); }
function buildPreviewDocument(churchName: string, b: ResolvedBrandProfile, logoUrl?: string) {
  const buttonRadius = b.buttonStyle === "rounded" ? "999px" : b.buttonStyle === "square" ? "0" : b.cornerRadius;
  const border = b.cardStyle === "flat" ? "0" : `1px solid ${b.borderColor}`;
  const cardBg = b.cardStyle === "soft" ? b.sectionBackgroundColor : b.backgroundColor;
  const isSplit = b.headerStyle === "split";
  const headerBg = b.headerStyle === "filled" ? b.headerBackgroundColor : b.backgroundColor;
  const headerText = b.headerStyle === "filled" ? b.headerTextColor : b.textColor;
  const logoWidth = b.logoSize === "small" ? 130 : b.logoSize === "large" ? 250 : 190;
  const logoHeight = b.logoSize === "small" ? 52 : b.logoSize === "large" ? 96 : 72;
  const logo = logoUrl ? `<img class="logo" src="${escapeHtml(new URL(logoUrl, location.origin).toString())}" onerror="this.style.display='none'" alt="${escapeHtml(churchName)} logo">` : `<div class="logo-placeholder">LOGO</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;background:#e9eceb;color:${b.textColor};font-family:${b.bodyFont}}body{padding:28px}.doc{max-width:${b.pageWidth};margin:0 auto;padding:${b.pagePadding};background:${b.backgroundColor};box-shadow:0 14px 40px rgba(0,0,0,.12)}
header{display:flex;align-items:stretch;justify-content:space-between;gap:${isSplit ? "0" : "28px"};margin-bottom:38px;padding:${b.headerStyle === "plain" ? "0 0 24px" : b.headerStyle === "filled" ? "24px" : "0"};background:${headerBg};color:${headerText};border-bottom:4px solid ${b.primaryColor};border-radius:${b.headerStyle === "filled" ? b.cornerRadius : "0"};overflow:hidden}header .text{flex:1;order:${b.logoPosition === "left" ? "2" : "1"};${isSplit ? "padding:24px 28px;" : ""}}header .brand{order:${b.logoPosition === "left" ? "1" : "2"};display:flex;align-items:center;justify-content:center;${isSplit ? `min-width:${Math.max(210, logoWidth + 56)}px;padding:22px 28px;background:${b.headerBackgroundColor};color:${b.headerTextColor};` : b.removeLogoBackground ? "padding:0;background:transparent;" : ""}}.logo{max-width:${logoWidth}px;max-height:${logoHeight}px;object-fit:contain}.logo-placeholder{padding:18px;border:1px dashed ${b.borderColor};color:${isSplit || b.headerStyle === "filled" ? b.headerTextColor : headerText};font-size:12px;letter-spacing:.18em}
.eyebrow{margin:0 0 8px;color:${b.headerStyle === "filled" ? b.headerTextColor : b.accentColor};font-size:12px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}.title{margin:0;font-family:${b.headingFont};font-size:34px;line-height:1.1;font-weight:${b.headingWeight};text-transform:${b.headingTransform}}.meta{margin:10px 0 0;color:${b.headerStyle === "filled" ? b.headerTextColor : b.mutedColor};opacity:.82;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
section{margin-bottom:${b.sectionSpacing}}h2,h3{font-family:${b.headingFont};font-weight:${b.headingWeight};text-transform:${b.headingTransform};color:${b.primaryColor}}h2{margin:0 0 12px;font-size:20px}h3{color:${b.accentColor};font-size:15px}p{line-height:1.65;margin:0 0 13px}.big{padding:22px 24px;border-left:6px solid ${b.accentColor};border-radius:${b.cornerRadius};background:${b.calloutBackgroundColor};color:${b.calloutTextColor}}.big h2{color:${b.calloutTextColor}}.scripture{padding:24px;border:1px solid ${b.borderColor};border-radius:${b.cornerRadius}}.scripture .text{padding:18px 20px;border-left:4px solid ${b.accentColor};background:${b.scriptureBackgroundColor};color:${b.scriptureTextColor}}.snapshot,.questions,.practice,.tip{padding:20px 22px;border:${border};border-radius:${b.cornerRadius};background:${cardBg};color:${b.sectionTextColor}}.snapshot h2,.practice h2,.tip h2{color:${b.sectionTextColor}}.questions{background:${b.questionBackgroundColor};color:${b.questionTextColor}}.questions h2,.questions h3{color:${b.questionTextColor}}ol{padding-left:22px}li{margin-bottom:10px;line-height:1.55}li::marker{color:${b.accentColor};font-weight:800}.prayer{padding:22px 24px;border-radius:${b.cornerRadius};background:${b.prayerBackgroundColor};color:${b.prayerTextColor}}.prayer h2{color:${b.prayerTextColor}}.button{display:inline-block;padding:11px 18px;border-radius:${buttonRadius};background:${b.primaryColor};color:white;font-weight:800;text-decoration:none}.muted{color:${b.mutedColor}}
</style></head><body><article class="doc"><header><div class="text"><p class="eyebrow">Group Multiplied</p><h1 class="title">A Sample Sermon Resource</h1><p class="meta">${escapeHtml(churchName)} · Genesis 2:1–3 · This Week</p></div><div class="brand">${logo}</div></header>
<section class="big"><h2>Big Idea</h2><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae sem at sapien luctus viverra. This block demonstrates the primary callout treatment.</p></section>
<section><h2>The Tension</h2><p>Praesent commodo cursus magna, vel scelerisque nisl consectetur. We often keep moving because stopping can expose what we are trusting.</p></section>
<section class="scripture"><h2>Read the Scripture</h2><p class="muted"><strong>Genesis 2:1–3</strong> · Berean Standard Bible</p><div class="text"><p><sup>1</sup> Lorem ipsum dolor sit amet, consectetur adipiscing elit. <sup>2</sup> Sed posuere consectetur est at lobortis. <sup>3</sup> Donec ullamcorper nulla non metus auctor fringilla.</p></div></section>
<section class="snapshot"><h2>Sermon Snapshot</h2><p>Morbi leo risus, porta ac consectetur ac, vestibulum at eros. Donec id elit non mi porta gravida at eget metus.</p></section>
<section class="questions"><h2>Discussion Questions</h2><h3>Understand</h3><ol><li>What stood out most clearly in the sermon’s explanation of this passage?</li><li>How did the pastor connect the passage to the larger story of Scripture?</li></ol><h3>Reflect</h3><ol><li>Where do you see this tension showing up in your own week?</li><li>What makes this truth difficult to trust in practice?</li></ol></section>
<section class="practice"><h2>Practice This Week</h2><p>Choose one concrete rhythm that helps you remember what God has done rather than measuring your life only by what you produce.</p><a class="button" href="#">Sample Action Button</a></section>
<section class="tip"><h2>Leader Tip</h2><p>Keep the conversation rooted in the sermon. Give the group room to apply the truth without rushing to solve every problem.</p></section>
<section class="prayer"><h2>Closing Prayer</h2><p>Father, help us remember who you are, trust what you have done, and carry your truth into the ordinary places of this week. Amen.</p></section>
</article></body></html>`;
}

function LogoUploads({ state, agentName, agent, setError }: { state: OnboardingState; agentName: string; agent: ReturnType<typeof useAgent<OnboardingState>>; setError: (error: string) => void }) {
  const [pending, setPending] = useState<string>();
  async function upload(kind: "primary" | "reverse" | "mark", file?: File) {
    if (!file) return; setError(""); setPending(kind);
    try { const response = await fetch(`/agents/church-onboarding-agent/${agentName}`, { method: "POST", headers: { "content-type": file.type, "x-file-name": file.name, "x-asset-kind": kind }, body: file }); if (!response.ok) setError(await response.text()); }
    finally { setPending(undefined); }
  }
  async function remove(kind: "primary" | "reverse" | "mark") {
    setError(""); setPending(kind);
    try { await agent.stub.removeLogo(kind); } catch (reason) { setError(reason instanceof Error ? reason.message : "The logo could not be removed."); } finally { setPending(undefined); }
  }
  return <div className="upload-note"><strong>Logo files</strong><span>Upload source-quality variants. The primary logo appears in the full resource preview.</span><div className="logo-grid">{(["primary", "reverse", "mark"] as const).map((kind) => { const saved = state.assets.find((asset) => asset.kind === kind); return <div className="logo-upload" key={kind}><label><span>{kind[0].toUpperCase() + kind.slice(1)} logo {saved ? `✓ ${saved.filename}` : ""}</span><input key={`${kind}-${saved?.uploadedAt || "empty"}`} type="file" disabled={pending === kind} accept="image/svg+xml,image/png,image/jpeg,image/webp" onChange={(event) => upload(kind, event.target.files?.[0])} /></label>{saved && <button className="text remove-logo" type="button" disabled={pending === kind} onClick={() => remove(kind)}>Remove</button>}</div>; })}</div></div>;
}

function Sources({ state, setState, busy, research, save }: { state: OnboardingState; setState: (state: OnboardingState) => void; busy: boolean; research: () => void; save: () => void }) {
  const add = () => setState({ ...state, links: [...state.links, { kind: "other", label: "", url: "" }] });
  const update = (index: number, patch: Partial<ChurchLink>) => setState({ ...state, links: state.links.map((link, i) => i === index ? { ...link, ...patch } : link) });
  return <><p className="eyebrow">Public sources</p><h2>Find the weekly inputs and brand system</h2><p className="lede">Research reviews the homepage plus key ministry pages and stylesheets, then suggests source links, colors, fonts, shape language, and accessibility checks for your confirmation.</p><button className="secondary" disabled={busy || !state.basics.website} onClick={research}>{busy ? "Inspecting pages…" : "Inspect website and brand"}</button>{state.brandAnalysis && <BrandResearch state={state} />}<div className="links">{state.links.map((link, index) => <div className="link-row" key={`${index}-${link.kind}`}><select value={link.kind} onChange={(event) => update(index, { kind: event.target.value as ChurchLink["kind"] })}><option value="sermon_archive">Sermon archive</option><option value="youtube">YouTube</option><option value="facebook">Facebook</option><option value="vimeo">Vimeo</option><option value="podcast">Podcast</option><option value="church_center">Church Center</option><option value="instagram">Instagram</option><option value="other">Other</option></select><input aria-label="Label" placeholder="Label" value={link.label} onChange={(event) => update(index, { label: event.target.value })} /><input aria-label="URL" type="url" placeholder="https://" value={link.url} onChange={(event) => update(index, { url: event.target.value })} /></div>)}</div><button className="text" onClick={add}>+ Add another source</button><footer><button className="primary" disabled={busy} onClick={save}>Confirm research and sources</button></footer></>;
}
function BrandResearch({ state }: { state: OnboardingState }) {
  const analysis = state.brandAnalysis!;
  return <section className="research-summary"><div className="research-stats"><strong>{analysis.pagesAnalyzed.length}</strong><span>pages</span><strong>{analysis.stylesheetsAnalyzed.length}</strong><span>stylesheets</span><strong>{analysis.colorCandidates.length}</strong><span>colors</span></div><div className="swatches">{analysis.colorCandidates.slice(0, 8).map((candidate) => <span key={candidate.value} title={candidate.value} style={{ backgroundColor: candidate.value }} />)}</div><div className="analysis-grid"><div><b>Suggested fonts</b><p>{analysis.fontCandidates.slice(0, 3).map((font) => font.value).join(" · ") || "Manual confirmation needed"}</p></div><div><b>Accessibility</b><p>{analysis.contrastChecks.map((check) => `${check.label}: ${check.ratio}:1 ${check.level === "pass" ? "✓" : "review"}`).join(" · ")}</p></div></div>{analysis.warnings.length > 0 && <ul className="warnings">{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</section>;
}
function Approval({ state, setState, busy, save }: { state: OnboardingState; setState: (state: OnboardingState) => void; busy: boolean; save: () => void }) {
  const reviewer = state.reviewers[0] || { name: "", email: "", role: "" };
  const setReviewer = (patch: Partial<Reviewer>) => setState({ ...state, reviewers: [{ ...reviewer, ...patch }] });
  const toggle = (resource: ResourceType) => setState({ ...state, resources: state.resources.includes(resource) ? state.resources.filter((item) => item !== resource) : [...state.resources, resource] });
  return <><p className="eyebrow">Approval</p><h2>Choose who signs off</h2><p className="lede">This reviewer receives one secure link with Preview buttons, Approve all, and separate feedback for each selected resource.</p><div className="grid"><Field label="Reviewer name" value={reviewer.name} onChange={(name) => setReviewer({ name })} /><Field label="Reviewer email" type="email" value={reviewer.email} onChange={(email) => setReviewer({ email })} /><Field label="Role" value={reviewer.role} onChange={(role) => setReviewer({ role })} /><Field label="Target delivery day" value={state.deliveryDay} onChange={(deliveryDay) => setState({ ...state, deliveryDay })} /></div><fieldset><legend>Weekly resources</legend>{(["monday", "group", "family"] as ResourceType[]).map((resource) => <label className="check" key={resource}><input type="checkbox" checked={state.resources.includes(resource)} onChange={() => toggle(resource)} />{resource[0].toUpperCase() + resource.slice(1)} Multiplied</label>)}</fieldset><footer><button className="primary" disabled={busy} onClick={save}>Confirm approval setup</button></footer></>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
