import type { OnboardingState } from "../types";

export type RepositoryFile = { path: string; content: string };

function css(state: OnboardingState): string {
  const b = state.brand;
  return `@import url("../../../styles/sunday-multiplied-base.css");

/* Generated for ${state.basics.name}. Keep the shared sm-* schema intact. */
:root {
  --sm-color-primary: ${b.primaryColor};
  --sm-color-secondary: ${b.secondaryColor};
  --sm-color-accent: ${b.accentColor};
  --sm-color-background: ${b.backgroundColor};
  --sm-color-text: ${b.textColor};
  --sm-font-heading: ${b.headingFont};
  --sm-font-body: ${b.bodyFont};
}

.sm-resource {
  color: var(--sm-color-text);
  background: var(--sm-color-background);
  font-family: var(--sm-font-body);
}

.sm-resource h1,
.sm-resource h2,
.sm-resource h3 {
  color: var(--sm-color-primary);
  font-family: var(--sm-font-heading);
}

.sm-resource__header-logo {
  display: block;
  max-height: 4rem;
  max-width: min(16rem, 70vw);
}

@media print {
  .sm-resource { background: #fff; }
  .sm-no-print { display: none !important; }
}
`;
}

export function buildRepositoryFiles(state: OnboardingState): RepositoryFile[] {
  const root = `churches/${state.basics.slug}`;
  const church = {
    schemaVersion: 1,
    church: state.basics,
    resources: state.resources,
    schedule: { serviceDay: state.serviceDay, deliveryDay: state.deliveryDay },
    approval: {
      reviewers: state.reviewers,
      linkLifetimeDays: state.approvalWindowDays,
      draftRetentionDays: state.draftRetentionDays,
      dashboardMode: "shared",
    },
    brand: {
      ...state.brand,
      stylesheet: `${root}/styles/${state.basics.slug}.css`,
      assets: state.assets.map(({ kind, filename, r2Key }) => ({ kind, filename, r2Key })),
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

## Research provenance

${state.findings.map((item) => `- **${item.field}**: ${item.value} (${item.confidence}; ${item.sourceUrl})`).join("\n") || "- No automated findings recorded."}
`;
  return [
    { path: `${root}/church.json`, content: `${JSON.stringify(church, null, 2)}\n` },
    { path: `${root}/styles/${state.basics.slug}.css`, content: css(state) },
    { path: `${root}/sources/streaming.json`, content: `${JSON.stringify(streaming, null, 2)}\n` },
    { path: `${root}/brand/source-notes.md`, content: notes },
    { path: `${root}/resources/.gitkeep`, content: "" },
  ];
}

