export type OnboardingPhase =
  | "identified" | "researching" | "needs_confirmation" | "assets_complete"
  | "style_ready" | "repo_ready" | "approval_ready" | "active";

export type ResourceType = "monday" | "group" | "family";
export type LinkKind = "website" | "sermon_archive" | "youtube" | "facebook" | "vimeo" | "podcast" | "church_center" | "instagram" | "other";
export type ChurchLink = { kind: LinkKind; url: string; label: string; verifiedAt?: string };
export type BrandAsset = { kind: "primary" | "reverse" | "mark" | "favicon"; filename: string; r2Key: string; contentType: string; uploadedAt: string };
export type Reviewer = { name: string; email: string; role: string };
export type ChurchBasics = { name: string; slug: string; city: string; state: string; timezone: string; website: string };
export type StyleTheme = "contemporary" | "traditional" | "modern" | "editorial";

export type BrandProfile = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  cornerRadius: string;
  buttonStyle: "square" | "soft" | "rounded";
  visualTone: string;
  visualNotes: string;
  styleTheme?: StyleTheme;
  mutedColor?: string;
  borderColor?: string;
  sectionBackgroundColor?: string;
  calloutBackgroundColor?: string;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  scriptureBackgroundColor?: string;
  questionBackgroundColor?: string;
  prayerBackgroundColor?: string;
  prayerTextColor?: string;
  headingWeight?: "600" | "700" | "800";
  headingTransform?: "none" | "uppercase";
  pageWidth?: string;
  pagePadding?: string;
  sectionSpacing?: string;
  headerStyle?: "plain" | "filled" | "split";
  logoPosition?: "left" | "right";
  cardStyle?: "flat" | "bordered" | "soft";
};

export type ResolvedBrandProfile = Required<BrandProfile>;

export const defaultBrandProfile = (): ResolvedBrandProfile => ({
  primaryColor: "#153f35",
  secondaryColor: "#dfe9e1",
  accentColor: "#c69a4b",
  backgroundColor: "#fffdf8",
  textColor: "#14211d",
  mutedColor: "#68736e",
  borderColor: "#d9dfdc",
  sectionBackgroundColor: "#f5f7f5",
  calloutBackgroundColor: "#eef3ef",
  headerBackgroundColor: "#ffffff",
  headerTextColor: "#14211d",
  scriptureBackgroundColor: "#f5f7f5",
  questionBackgroundColor: "#f5f7f5",
  prayerBackgroundColor: "#153f35",
  prayerTextColor: "#ffffff",
  headingFont: "Georgia, serif",
  bodyFont: "Arial, sans-serif",
  headingWeight: "800",
  headingTransform: "uppercase",
  cornerRadius: "8px",
  pageWidth: "800px",
  pagePadding: "52px",
  sectionSpacing: "30px",
  buttonStyle: "soft",
  headerStyle: "plain",
  logoPosition: "right",
  cardStyle: "soft",
  styleTheme: "contemporary",
  visualTone: "",
  visualNotes: "",
});

export function normalizeBrandProfile(value?: Partial<BrandProfile> | null): ResolvedBrandProfile {
  return { ...defaultBrandProfile(), ...(value || {}) };
}

export type BrandCandidate = { value: string; occurrences: number; sources: string[] };
export type ContrastCheck = { label: string; foreground: string; background: string; ratio: number; level: "pass" | "review" };
export type BrandAnalysis = {
  analyzedAt: string;
  pagesAnalyzed: string[];
  stylesheetsAnalyzed: string[];
  colorCandidates: BrandCandidate[];
  fontCandidates: BrandCandidate[];
  radiusCandidates: BrandCandidate[];
  suggestedProfile: BrandProfile;
  contrastChecks: ContrastCheck[];
  warnings: string[];
};
export type ResearchFinding = { field: string; value: string; sourceUrl: string; confidence: "high" | "medium" | "low" };
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
  brandAnalysis?: BrandAnalysis;
  checklist: Record<string, boolean>;
  github?: { branch: string; pullRequestUrl: string; createdAt: string };
  updatedAt: string;
};

export const emptyState = (): OnboardingState => ({
  version: 1,
  phase: "identified",
  basics: { name: "", slug: "", city: "", state: "", timezone: "America/New_York", website: "" },
  links: [],
  brand: defaultBrandProfile(),
  assets: [],
  reviewers: [],
  resources: ["monday", "group", "family"],
  serviceDay: "sunday",
  deliveryDay: "Monday",
  approvalWindowDays: 30,
  draftRetentionDays: 90,
  findings: [],
  checklist: { identity: false, sources: false, logos: false, brand: false, reviewer: false, repository: false },
  updatedAt: new Date(0).toISOString(),
});
