export type ReviewStatus =
  | "draft"
  | "ready_for_review"
  | "viewed"
  | "revision_requested"
  | "revised"
  | "approved"
  | "delivered"
  | "archived";

export type ResourceReviewDecision = "pending" | "approved" | "revision_requested";

export type ReviewResource = {
  id: string;
  kind: string;
  title: string;
  version: number;
  previewUrl: string | null;
  reviewDecision: ResourceReviewDecision;
};

export type ReviewPackage = {
  id: string;
  churchName: string;
  title: string;
  seriesTitle: string | null;
  weekOf: string;
  scripture: string | null;
  status: ReviewStatus;
  reviewerName: string | null;
  reviewerEmail: string | null;
  resources: ReviewResource[];
};
