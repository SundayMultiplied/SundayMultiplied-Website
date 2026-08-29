import type { OnboardingState } from "../types";

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

function contrast(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function accessibleLabelColor(state: OnboardingState): string {
  const { primaryColor, textColor, secondaryColor, accentColor, backgroundColor } = state.brand;
  return [primaryColor, textColor, secondaryColor, accentColor]
    .find((candidate) => contrast(candidate, backgroundColor) >= 4.5) || textColor;
}

function css(state: OnboardingState): string {
  const b = state.brand;
  const labelColor = accessibleLabelColor(state);
  return `/* Generated for ${state.basics.name}. Shared resource layout is loaded separately. */
:root {
  --sm-color-primary: ${b.primaryColor};
  --sm-color-secondary: ${b.secondaryColor};
  --sm-color-accent: ${b.accentColor};
  --sm-color-background: ${b.backgroundColor};
  --sm-color-text: ${b.textColor};
  --sm-color-label: ${labelColor};
  --sm-font-heading: ${b.headingFont};
  --sm-font-body: ${b.bodyFont};
  --sm-corner-radius: ${b.cornerRadius};
}

.sm-resource,
.sm-document {
  color: var(--sm-color-text);
  background: var(--sm-color-background);
  font-family: var(--sm-font-body);
}

.sm-resource h1, .sm-resource h2, .sm-resource h3,
.sm-document h1, .sm-document h2, .sm-document h3 {
  font-family: var(--sm-font-heading);
}

.sm-resource__eyebrow, .sm-resource__section-label,
.sm-eyebrow {
  color: var(--sm-color-label);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.sm-resource__card,
.sm-resource__scripture,
.sm-resource__practice {
  border: 1px solid color-mix(in srgb, var(--sm-color-primary) 18%, transparent);
  border-radius: var(--sm-corner-radius);
  background: color-mix(in srgb, var(--sm-color-background) 94%, var(--sm-color-secondary));
}

.sm-resource a,
.sm-resource__button {
  color: var(--sm-color-primary);
  font-weight: 700;
}

.sm-resource__button {
  border-radius: ${b.buttonStyle === "rounded" ? "999px" : b.buttonStyle === "square" ? "0" : "var(--sm-corner-radius)"};
}

.sm-resource__header-logo,
.sm-church-logo {
  display: block;
  max-height: 4rem;
  max-width: min(16rem, 70vw);
}

@media print {
  .sm-resource { color: #111; background: #fff; }
  .sm-resource__card,
  .sm-resource__scripture,
  .sm-resource__practice { border-color: #bbb; background: #fff; }
  .sm-no-print { display: none !important; }
}
`;
}

export function buildRepositoryFiles(state: OnboardingState): RepositoryFile[] {
  const root = `churches/${state.basics.slug}`;
  const publicStylesheet = `/resources/${state.basics.slug}/church.css`;
  const publicLogo = `/resources/${state.basics.slug}/logo`;
  const churchStyles = css(state);
  const church = {
    schemaVersion: 1,
    church: state.basics,
    resources: state.resources,
    schedule: { serviceDay: state.serviceDay, deliveryDay: state.deliveryDay },
    approval: {
      reviewerConfigured: state.reviewers.length > 0,
      linkLifetimeDays: state.approvalWindowDays,
      draftRetentionDays: state.draftRetentionDays,
      dashboardMode: "shared",
    },
    brand: {
      ...state.brand,
      stylesheet: `${root}/styles/${state.basics.slug}.css`,
      publicStylesheet,
      sharedStylesheet: SHARED_RESOURCE_STYLESHEET,
      logoUrl: state.assets.some((asset) => asset.kind === "primary") ? publicLogo : "",
      assets: state.assets.map(({ kind, filename, r2Key }) => ({
        kind,
        filename,
        r2Key,
        publicUrl: kind === "primary" ? publicLogo : undefined,
      })),
    },
    sources: `${root}/sources/streaming.json`,
  };
  const streaming = {
    schemaVersion: 1,
    church: state.basics.slug,
    links: state.links,
  };
  const notes = `# ${state.basics.name} brand source notes

Generated during onboarding. Confirm all inferred colors, fonts, and assets before activation.

${state.brand.visualNotes || "No additional visual notes recorded."}

## Automated brand review

- Visual tone: ${state.brand.visualTone || "Not recorded"}
- Button style: ${state.brand.buttonStyle}
- Corner radius: ${state.brand.cornerRadius}
- Pages inspected: ${state.brandAnalysis?.pagesAnalyzed.length || 0}
- Stylesheets inspected: ${state.brandAnalysis?.stylesheetsAnalyzed.length || 0}

${state.brandAnalysis?.warnings.map((warning) => `- Review: ${warning}`).join("\n") || "- No automated warnings."}

## Research provenance

${state.findings.map((item) => `- **${item.field}**: ${item.value} (${item.confidence}; ${item.sourceUrl})`).join("\n") || "- No automated findings recorded."}
`;
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
