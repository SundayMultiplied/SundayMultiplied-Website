import type { BrandProfile, OnboardingState, StyleTheme } from "../types";
import { normalizeBrandProfile } from "../types";

export type RepositoryFile = { path: string; content: string };
const SHARED_RESOURCE_STYLESHEET = "/resources/_shared/sunday-multiplied-base.css";

function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 0;
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(a: string, b: string): number {
  const values = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function accessibleLabelColor(b: ReturnType<typeof normalizeBrandProfile>): string {
  return [b.accentColor, b.primaryColor, b.textColor, b.secondaryColor].find((candidate) => contrast(candidate, b.backgroundColor) >= 4.5) || b.textColor;
}
function inferStyleTheme(b: ReturnType<typeof normalizeBrandProfile>): StyleTheme {
  if (b.headerStyle === "split" && b.cardStyle === "flat") return "modern";
  if (b.cardStyle === "bordered" && /palatino/i.test(b.bodyFont)) return "traditional";
  if (b.cardStyle === "bordered" && /inter/i.test(b.headingFont) && /(georgia|times)/i.test(b.bodyFont)) return "editorial";
  return b.styleTheme || "contemporary";
}
function logoDimensions(size: ReturnType<typeof normalizeBrandProfile>["logoSize"]) {
  if (size === "small") return { width: 130, height: 52 };
  if (size === "large") return { width: 250, height: 96 };
  return { width: 190, height: 72 };
}
function structuralThemeCss(theme: StyleTheme, b: ReturnType<typeof normalizeBrandProfile>): string {
  if (theme === "traditional") return `
/* Traditional composition */
.sm-header, .sm-header.sm-header--with-logo { border-top: 1px solid ${b.borderColor}; border-bottom: 3px double ${b.primaryColor}; padding-top: 18px; }
.sm-title { letter-spacing: -.015em; }
.sm-section h2 { padding-bottom: 8px; border-bottom: 1px solid ${b.borderColor}; }
.sm-section--big-idea, .sm-section--reflection { border-left: 0; border-top: 1px solid ${b.primaryColor}; border-bottom: 1px solid ${b.primaryColor}; padding: 18px 0; }
.sm-section--prayer { border: 1px solid ${b.primaryColor}; }
`;
  if (theme === "modern") return `
/* Modern composition */
.sm-title { letter-spacing: -.035em; line-height: .98; }
.sm-section h2 { display: flex; align-items: center; gap: 12px; letter-spacing: .04em; }
.sm-section h2::before { content: ""; width: 32px; height: 5px; flex: 0 0 32px; background: ${b.accentColor}; }
.sm-section--big-idea, .sm-section--reflection { border-left: 0; border-top: 6px solid ${b.primaryColor}; border-bottom: 1px solid ${b.borderColor}; padding: 24px 0; }
.sm-question-group { border: 0; border-left: 5px solid ${b.accentColor}; padding-left: 26px; }
.sm-scripture-text { border-left-width: 8px; }
.sm-section--prayer { border-radius: 0; }
`;
  if (theme === "editorial") return `
/* Editorial composition */
.sm-header, .sm-header.sm-header--with-logo { border-top: 7px solid ${b.primaryColor}; border-bottom: 2px solid ${b.primaryColor}; padding-top: 24px; }
.sm-title { font-size: clamp(2.5rem, 7vw, 4.4rem); line-height: .92; letter-spacing: -.055em; max-width: 11ch; }
.sm-meta { padding-top: 12px; border-top: 1px solid ${b.borderColor}; }
.sm-section h2 { font-size: 1rem; letter-spacing: .14em; text-transform: uppercase; }
.sm-section--big-idea, .sm-section--reflection { border: 2px solid ${b.primaryColor}; border-left-width: 2px; border-radius: 0; box-shadow: 8px 8px 0 ${b.secondaryColor}; }
.sm-question-group, .sm-resource__card, .sm-resource__scripture, .sm-resource__practice { border-width: 2px; }
.sm-scripture-text { border-left: 0; border-top: 4px solid ${b.accentColor}; padding-left: 0; padding-right: 0; }
.sm-section--prayer { border-radius: 0; border: 2px solid ${b.primaryColor}; }
`;
  return `
/* Contemporary composition */
.sm-header, .sm-header.sm-header--with-logo { box-shadow: 0 12px 30px rgba(20, 33, 29, .06); }
.sm-section--big-idea, .sm-section--reflection { box-shadow: 0 8px 24px rgba(20, 33, 29, .05); }
.sm-question-group, .sm-resource__card, .sm-resource__scripture, .sm-resource__practice { box-shadow: 0 6px 18px rgba(20, 33, 29, .04); }
`;
}

export function buildThemeCss(churchName: string, profile: BrandProfile): string {
  const b = normalizeBrandProfile(profile);
  const theme = inferStyleTheme(b);
  const label = accessibleLabelColor(b);
  const buttonRadius = b.buttonStyle === "rounded" ? "999px" : b.buttonStyle === "square" ? "0" : b.cornerRadius;
  const cardBorder = b.cardStyle === "flat" ? "0" : `1px solid ${b.borderColor}`;
  const cardBackground = b.cardStyle === "flat" ? b.backgroundColor : b.cardStyle === "soft" ? b.sectionBackgroundColor : b.backgroundColor;
  const logo = logoDimensions(b.logoSize);
  const logoOrder = b.logoPosition === "left" ? "-1" : "1";
  const headerBackground = b.headerStyle === "filled" ? b.headerBackgroundColor : b.backgroundColor;
  const headerText = b.headerStyle === "filled" ? b.headerTextColor : b.textColor;
  const headerPadding = b.headerStyle === "plain" ? "0 0 24px" : b.headerStyle === "filled" ? "24px" : "0";
  const logoBackdropRules = b.removeLogoBackground && b.headerStyle !== "split"
    ? ".sm-header-logo-wrap { padding: 0; background: transparent; border-radius: 0; }\n"
    : "";
  const splitRules = b.headerStyle === "split" ? `
.sm-header--with-logo .sm-header-content { gap: 0; align-items: stretch; }
.sm-header-text { padding: 24px 28px; }
.sm-header-logo-wrap { min-width: ${Math.max(210, logo.width + 56)}px; padding: 22px 28px; justify-content: center; background: ${b.headerBackgroundColor}; color: ${b.headerTextColor}; }
` : "";
  return `/* Visual theme for ${churchName}. Generated by the Sunday Multiplied Theme Editor. */
/* Style theme: ${theme} */
:root {
  --sm-color-primary: ${b.primaryColor};
  --sm-color-secondary: ${b.secondaryColor};
  --sm-color-accent: ${b.accentColor};
  --sm-color-background: ${b.backgroundColor};
  --sm-color-text: ${b.textColor};
  --sm-color-muted: ${b.mutedColor};
  --sm-color-border: ${b.borderColor};
  --sm-color-section-background: ${b.sectionBackgroundColor};
  --sm-color-callout-background: ${b.calloutBackgroundColor};
  --sm-color-label: ${label};
  --sm-font-heading: ${b.headingFont};
  --sm-font-body: ${b.bodyFont};
  --sm-corner-radius: ${b.cornerRadius};
  --sm-page-width: ${b.pageWidth};
  --sm-page-padding: ${b.pagePadding};
  --sm-section-spacing: ${b.sectionSpacing};
}

body.sm-resource { width: 100%; max-width: none; margin: 0; padding: 28px; background: #e9eceb; color: ${b.textColor}; font-family: ${b.bodyFont}; line-height: 1.65; box-shadow: none; }
.sm-document { width: min(${b.pageWidth}, 100%); max-width: ${b.pageWidth}; margin-inline: auto; padding: ${b.pagePadding}; color: ${b.textColor}; background: ${b.backgroundColor}; font-family: ${b.bodyFont}; }
.sm-header, .sm-header.sm-header--with-logo { margin-bottom: 38px; padding: ${headerPadding}; background: ${headerBackground}; color: ${headerText}; border-bottom: 4px solid ${b.primaryColor}; border-radius: ${b.headerStyle === "filled" ? b.cornerRadius : "0"}; overflow: hidden; }
.sm-header--with-logo .sm-header-content { display: flex; align-items: center; justify-content: space-between; gap: 28px; }
.sm-header-text { flex: 1 1 auto; min-width: 0; }
.sm-header-logo-wrap { flex: 0 0 auto; display: flex; align-items: center; order: ${logoOrder}; }
${logoBackdropRules}.sm-church-logo, .sm-resource__header-logo { display: block; max-width: ${logo.width}px; max-height: ${logo.height}px; width: auto; height: auto; object-fit: contain; }
.sm-eyebrow, .sm-resource__eyebrow, .sm-resource__section-label { margin: 0 0 8px; color: ${b.headerStyle === "filled" ? b.headerTextColor : "var(--sm-color-label)"}; font-size: 12px; font-weight: 800; letter-spacing: .15em; line-height: 1.2; text-transform: uppercase; }
.sm-title { margin: 0; color: ${headerText}; font-family: ${b.headingFont}; font-size: 34px; line-height: 1.1; font-weight: ${b.headingWeight}; text-transform: ${b.headingTransform}; }
.sm-meta { margin: 10px 0 0; color: ${b.headerStyle === "filled" ? b.headerTextColor : b.mutedColor}; opacity: .82; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
${splitRules}
.sm-section { margin-bottom: ${b.sectionSpacing}; padding: 0; border-bottom: 0; }
.sm-section h2 { margin: 0 0 12px; color: ${b.primaryColor}; font-family: ${b.headingFont}; font-size: 20px; line-height: 1.2; font-weight: ${b.headingWeight}; text-transform: ${b.headingTransform}; }
.sm-section h3 { margin: 20px 0 8px; color: ${b.accentColor}; font-family: ${b.headingFont}; font-size: 15px; line-height: 1.3; font-weight: ${b.headingWeight}; text-transform: ${b.headingTransform}; }
.sm-section p, .sm-section li { font-size: 16px; line-height: 1.65; }
.sm-section li::marker { color: ${b.accentColor}; font-weight: 800; }
.sm-section--big-idea, .sm-section--reflection { padding: 22px 24px; border-left: 6px solid ${b.accentColor}; border-radius: ${b.cornerRadius}; background: ${b.calloutBackgroundColor}; color: ${b.calloutTextColor}; }
.sm-section--big-idea h2, .sm-section--big-idea h3, .sm-section--reflection h2, .sm-section--reflection h3 { color: ${b.calloutTextColor}; }
.sm-section--scripture { padding: 24px; border: 1px solid ${b.borderColor}; border-radius: ${b.cornerRadius}; background: ${b.backgroundColor}; }
.sm-scripture-reference { color: ${b.accentColor}; font-weight: 800; text-transform: uppercase; }
.sm-scripture-text { padding: 18px 20px; border-left: 4px solid ${b.accentColor}; background: ${b.scriptureBackgroundColor}; color: ${b.scriptureTextColor}; }
.sm-scripture-attribution { color: ${b.mutedColor}; }
.sm-question-group, .sm-resource__card, .sm-resource__scripture, .sm-resource__practice { padding: 20px 22px; border: ${cardBorder}; border-radius: ${b.cornerRadius}; background: ${cardBackground}; color: ${b.sectionTextColor}; }
.sm-resource__card h2, .sm-resource__card h3, .sm-resource__practice h2, .sm-resource__practice h3 { color: ${b.sectionTextColor}; }
.sm-question-group { background: ${b.questionBackgroundColor}; color: ${b.questionTextColor}; }
.sm-question-group h2, .sm-question-group h3 { color: ${b.questionTextColor}; }
.sm-document--monday .sm-section--takeaways, .sm-document--group .sm-section--key-moments { padding: 22px 24px; border: ${cardBorder}; border-radius: ${b.cornerRadius}; background: ${cardBackground}; color: ${b.sectionTextColor}; }
.sm-document--group .sm-section--midweek, .sm-document--group .sm-section--leader-tip { padding: 20px 22px; border-radius: ${b.cornerRadius}; background: ${b.calloutBackgroundColor}; color: ${b.calloutTextColor}; }
.sm-document--group .sm-section--midweek h2, .sm-document--group .sm-section--leader-tip h2 { color: ${b.calloutTextColor}; }
.sm-section--prayer { padding: 22px 24px; border-radius: ${b.cornerRadius}; background: ${b.prayerBackgroundColor}; color: ${b.prayerTextColor}; }
.sm-section--prayer h2, .sm-section--prayer h3 { color: ${b.prayerTextColor}; }
a { color: ${b.primaryColor}; font-weight: 700; text-underline-offset: 3px; }
.sm-resource__button, .sm-theme-button { display: inline-block; border: 0; padding: 11px 18px; border-radius: ${buttonRadius}; background: ${b.primaryColor}; color: ${contrast("#ffffff", b.primaryColor) >= 4.5 ? "#ffffff" : b.textColor}; font-weight: 800; }
${structuralThemeCss(theme, b)}
@media (max-width: 680px) {
  body.sm-resource { padding: 14px; }
  .sm-document { padding: 30px 22px; }
  .sm-header--with-logo .sm-header-content { align-items: flex-start; flex-direction: column; }
  .sm-header-logo-wrap { order: -1; min-width: 0; width: 100%; }
  .sm-church-logo { max-width: ${Math.min(165, logo.width)}px; max-height: ${Math.min(72, logo.height)}px; }
}
@media print {
  @page { size: letter portrait; margin: .35in; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body.sm-resource { width: 100%; max-width: none; padding: 0; font-size: 11px; line-height: 1.35; box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sm-document { max-width: none; width: 100%; margin: 0; padding: 0; background: #fff; color: #111; }
  .sm-header, .sm-header.sm-header--with-logo { margin-bottom: 10px; padding: 0 0 8px; background: #fff; color: #111; border-radius: 0; border-bottom-color: #000; box-shadow: none; }
  .sm-header-logo-wrap { background: #fff; padding: 0; }
  .sm-title, .sm-eyebrow, .sm-meta { color: #111; }
  .sm-section { margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; }
  .sm-section--big-idea, .sm-section--reflection, .sm-question-group { box-shadow: none; }
  .sm-section--prayer { border: 1px solid #000; background: #fff; color: #000; }
  .sm-section--prayer h2 { color: #000; }
  .sm-no-print { display: none !important; }
}
`;
}

export function buildRepositoryFiles(state: OnboardingState): RepositoryFile[] {
  const root = `churches/${state.basics.slug}`;
  const publicStylesheet = `/resources/${state.basics.slug}/church.css`;
  const publicLogo = `/api/resource-assets/${state.basics.slug}/logo`;
  const churchStyles = buildThemeCss(state.basics.name, state.brand);
  const church = {
    schemaVersion: 1,
    church: state.basics,
    resources: state.resources,
    schedule: { serviceDay: state.serviceDay, deliveryDay: state.deliveryDay },
    approval: { reviewerConfigured: state.reviewers.length > 0, linkLifetimeDays: state.approvalWindowDays, draftRetentionDays: state.draftRetentionDays, dashboardMode: "shared" },
    brand: {
      ...normalizeBrandProfile(state.brand),
      stylesheet: `${root}/styles/${state.basics.slug}.css`,
      publicStylesheet,
      sharedStylesheet: SHARED_RESOURCE_STYLESHEET,
      logoUrl: state.assets.some((asset) => asset.kind === "primary") ? publicLogo : "",
      assets: state.assets.map(({ kind, filename, r2Key }) => ({ kind, filename, r2Key, publicUrl: kind === "primary" ? publicLogo : undefined })),
    },
    sources: `${root}/sources/streaming.json`,
  };
  const streaming = { schemaVersion: 1, church: state.basics.slug, links: state.links };
  const notes = `# ${state.basics.name} brand source notes\n\nGenerated during onboarding. Confirm all inferred colors, fonts, and assets before activation.\n\n${state.brand.visualNotes || "No additional visual notes recorded."}\n\n## Automated brand review\n\n- Visual tone: ${state.brand.visualTone || "Not recorded"}\n- Style theme: ${inferStyleTheme(normalizeBrandProfile(state.brand))}\n- Button style: ${state.brand.buttonStyle}\n- Corner radius: ${state.brand.cornerRadius}\n- Logo size: ${normalizeBrandProfile(state.brand).logoSize}\n- Remove logo background: ${normalizeBrandProfile(state.brand).removeLogoBackground ? "yes" : "no"}\n- Pages inspected: ${state.brandAnalysis?.pagesAnalyzed.length || 0}\n- Stylesheets inspected: ${state.brandAnalysis?.stylesheetsAnalyzed.length || 0}\n\n${state.brandAnalysis?.warnings.map((warning) => `- Review: ${warning}`).join("\n") || "- No automated warnings."}\n\n## Research provenance\n\n${state.findings.map((item) => `- **${item.field}**: ${item.value} (${item.confidence}; ${item.sourceUrl})`).join("\n") || "- No automated findings recorded."}\n`;
  return [
    { path: `${root}/church.json`, content: `${JSON.stringify(church, null, 2)}\n` },
    { path: `${root}/styles/${state.basics.slug}.css`, content: churchStyles },
    { path: `public/resources/${state.basics.slug}/church.css`, content: churchStyles },
    { path: `${root}/sources/streaming.json`, content: `${JSON.stringify(streaming, null, 2)}\n` },
    { path: `${root}/brand/analysis.json`, content: `${JSON.stringify(state.brandAnalysis || null, null, 2)}\n` },
    { path: `${root}/brand/source-notes.md`, content: notes },
    { path: `${root}/resources/.gitkeep`, content: "" },
  ];
}
