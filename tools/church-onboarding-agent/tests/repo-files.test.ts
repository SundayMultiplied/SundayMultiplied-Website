import { describe, expect, it } from "vitest";
import { buildRepositoryFiles } from "../src/services/repo-files";
import { emptyState } from "../src/types";

describe("repository structure", () => {
  it("uses stable church paths, shared approval, and public resource assets", () => {
    const state = emptyState();
    state.basics = { ...state.basics, name: "Southside Church", slug: "southside", website: "https://example.com" };
    state.reviewers = [{ name: "Reviewer", email: "reviewer@example.com", role: "Communications" }];
    state.assets = [{
      kind: "primary",
      filename: "logo.png",
      r2Key: "churches/southside/brand/primary-logo.png",
      contentType: "image/png",
      uploadedAt: "2026-08-29T00:00:00.000Z",
    }];
    state.brand = {
      ...state.brand,
      primaryColor: "#3f6e82",
      accentColor: "#dbedeb",
      backgroundColor: "#ffffff",
      textColor: "#525252",
    };
    const files = buildRepositoryFiles(state);
    expect(files.map((file) => file.path)).toEqual([
      "churches/southside/church.json",
      "churches/southside/styles/southside.css",
      "public/resources/southside/church.css",
      "churches/southside/sources/streaming.json",
      "churches/southside/brand/analysis.json",
      "churches/southside/brand/source-notes.md",
      "churches/southside/resources/.gitkeep",
    ]);
    expect(files[0].content).toContain('"dashboardMode": "shared"');
    expect(files[0].content).toContain('"reviewerConfigured": true');
    expect(files[0].content).toContain('"publicStylesheet": "/resources/southside/church.css"');
    expect(files[0].content).toContain('"sharedStylesheet": "/resources/_shared/sunday-multiplied-base.css"');
    expect(files[0].content).toContain('"logoUrl": "/api/resource-assets/southside/logo"');
    expect(files[0].content).toContain('"publicUrl": "/api/resource-assets/southside/logo"');
    expect(files[0].content).not.toContain("reviewer@example.com");
    expect(files[0].content).not.toContain('"reviewers"');
    expect(files[1].content).not.toContain("@import");
    expect(files[1].content).toContain("--sm-corner-radius");
    expect(files[1].content).toContain("--sm-color-label: #3f6e82");
    expect(files[1].content).toContain("color: var(--sm-color-label)");
    expect(files[2].content).toBe(files[1].content);
  });
});
