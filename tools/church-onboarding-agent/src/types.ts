export type OnboardingPhase =
  | "identified"
  | "researching"
  | "needs_confirmation"
  | "assets_complete"
  | "style_ready"
  | "repo_ready"
  | "approval_ready"
  | "active";

export type ResourceType = "monday" | "group" | "family";

export type LinkKind =
  | "website"
  | "sermon_archive"
  | "youtube"
  | "facebook"
  | "vimeo"
  | "podcast"
  | "church_center"
  | "instagram"
  | "other";

export type ChurchLink = {
  kind: LinkKind;
  url: string;
  label: string;
  verifiedAt?: string;
};

export type BrandAsset = {
  kind: "primary" | "reverse" | "mark" | "favicon";
  filename: string;
  r2Key: string;
  contentType: string;
  uploadedAt: string;
};

export type Reviewer = {
  name: string;
  email: string;
  role: string;
};

export type ChurchBasics = {
  name: string;
  slug: string;
  city: string;
  state: string;
  timezone: string;
  website: string;
};

export type BrandProfile = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  visualNotes: string;
};

export type ResearchFinding = {
  field: string;
  value: string;
  sourceUrl: string;
  confidence: "high" | "medium" | "low";
};

export type OnboardingState = {
  version: 1;
  phase: OnboardingPhase;
  basics: ChurchBasics;
  links: ChurchLink[];
  brand: BrandProfile;
  assets: BrandAsset[];
  reviewers: Reviewer[];
  resources: ResourceType[];
  serviceDay: "sunday";
  deliveryDay: string;
  approvalWindowDays: number;
  draftRetentionDays: number;
  findings: ResearchFinding[];
  checklist: Record<string, boolean>;
  github?: {
    branch: string;
    pullRequestUrl: string;
    createdAt: string;
  };
  updatedAt: string;
};

export const emptyState = (): OnboardingState => ({
  version: 1,
  phase: "identified",
  basics: {
    name: "",
    slug: "",
    city: "",
    state: "",
    timezone: "America/New_York",
    website: "",
  },
  links: [],
  brand: {
    primaryColor: "#153f35",
    secondaryColor: "#dfe9e1",
    accentColor: "#c69a4b",
    backgroundColor: "#fffdf8",
    textColor: "#14211d",
    headingFont: "Georgia, serif",
    bodyFont: "Arial, sans-serif",
    visualNotes: "",
  },
  assets: [],
  reviewers: [],
  resources: ["monday", "group", "family"],
  serviceDay: "sunday",
  deliveryDay: "Monday",
  approvalWindowDays: 30,
  draftRetentionDays: 90,
  findings: [],
  checklist: {
    identity: false,
    sources: false,
    logos: false,
    brand: false,
    reviewer: false,
    repository: false,
  },
  updatedAt: new Date(0).toISOString(),
});

