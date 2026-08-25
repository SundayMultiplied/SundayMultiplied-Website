import type { OnboardingState } from "../types";

export type CrmStage =
  | "Information gathering"
  | "Research complete"
  | "Brand confirmed"
  | "Approval configured"
  | "Pull request created"
  | "Active";

export type CrmUpdate = {
  stage: CrmStage;
  startedAt?: string;
  brandProfile?: string;
  repositoryWorkspace?: string;
  onboardingDraftUrl?: string;
};

type CrmEnv = {
  CRM_WEBHOOK_URL?: string;
  CRM_WEBHOOK_SECRET?: string;
};

export type CrmSyncResult =
  | { status: "updated"; row?: number }
  | { status: "not_configured" }
  | { status: "failed"; message: string };

export function summarizeBrand(state: OnboardingState): string {
  const brand = state.brand;
  return [
    `Primary ${brand.primaryColor}`,
    `Secondary ${brand.secondaryColor}`,
    `Accent ${brand.accentColor}`,
    `Heading: ${brand.headingFont}`,
    `Body: ${brand.bodyFont}`,
  ].join(" | ");
}

export async function syncOnboardingCrm(
  env: CrmEnv,
  state: OnboardingState,
  update: CrmUpdate,
  fetchImpl: typeof fetch = fetch,
): Promise<CrmSyncResult> {
  if (!env.CRM_WEBHOOK_URL || !env.CRM_WEBHOOK_SECRET) return { status: "not_configured" };

  try {
    const url = new URL(env.CRM_WEBHOOK_URL);
    if (url.protocol !== "https:") throw new Error("CRM webhook must use HTTPS.");

    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: env.CRM_WEBHOOK_SECRET,
        event: "church_onboarding",
        church: {
          name: state.basics.name,
          website: state.basics.website,
          slug: state.basics.slug,
        },
        fields: update,
        sentAt: new Date().toISOString(),
      }),
    });

    const body = await response.text();
    if (!response.ok) throw new Error(`CRM webhook returned ${response.status}: ${body.slice(0, 180)}`);
    const parsed = body ? JSON.parse(body) as { row?: number } : {};
    return { status: "updated", row: parsed.row };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CRM sync error.";
    console.error("CRM sync failed", { church: state.basics.slug, stage: update.stage, message });
    return { status: "failed", message };
  }
}
