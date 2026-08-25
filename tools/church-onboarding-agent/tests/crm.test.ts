import { describe, expect, it, vi } from "vitest";
import { emptyState } from "../src/types";
import { summarizeBrand, syncOnboardingCrm } from "../src/services/crm";

describe("onboarding CRM sync", () => {
  it("does nothing when the webhook is not configured", async () => {
    await expect(syncOnboardingCrm({}, emptyState(), { stage: "Information gathering" }))
      .resolves.toEqual({ status: "not_configured" });
  });

  it("sends the church identity and milestone fields", async () => {
    const state = emptyState();
    state.basics = {
      name: "Calvary Baptist Temple",
      slug: "calvary-baptist-temple",
      city: "Savannah",
      state: "GA",
      timezone: "America/New_York",
      website: "https://www.cbtsavannah.org/",
    };
    const fakeFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.secret).toBe("test-secret");
      expect(payload.church.name).toBe("Calvary Baptist Temple");
      expect(payload.fields.stage).toBe("Brand confirmed");
      return new Response(JSON.stringify({ ok: true, row: 5 }), { status: 200 });
    }) as typeof fetch;

    await expect(syncOnboardingCrm(
      { CRM_WEBHOOK_URL: "https://script.google.com/macros/s/test/exec", CRM_WEBHOOK_SECRET: "test-secret" },
      state,
      { stage: "Brand confirmed", brandProfile: summarizeBrand(state) },
      fakeFetch,
    )).resolves.toEqual({ status: "updated", row: 5 });
    expect(fakeFetch).toHaveBeenCalledOnce();
  });
});
