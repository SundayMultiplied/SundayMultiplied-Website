import { describe, expect, it } from "vitest";
import { buildRepositoryFiles } from "../src/services/repo-files";
import { emptyState } from "../src/types";

describe("repository structure", () => {
  it("uses the stable church slug and shared approval dashboard contract", () => {
    const state = emptyState();
    state.basics = { ...state.basics, name: "Southside Church", slug: "southside", website: "https://example.com" };
    state.reviewers = [{ name: "Reviewer", email: "reviewer@example.com", role: "Communications" }];
    const files = buildRepositoryFiles(state);
    expect(files.map((file) => file.path)).toEqual([
      "churches/southside/church.json",
      "churches/southside/styles/southside.css",
      "churches/southside/sources/streaming.json",
      "churches/southside/brand/source-notes.md",
      "churches/southside/resources/.gitkeep",
    ]);
    expect(files[0].content).toContain('"dashboardMode": "shared"');
    expect(files[1].content).toContain("sunday-multiplied-base.css");
  });
});

