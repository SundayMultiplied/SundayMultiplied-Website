import { describe, expect, it } from "vitest";
import { buildThemeCss } from "../src/services/repo-files";
import { normalizeBrandProfile } from "../src/types";

describe("Theme Editor production preview contract", () => {
  it("generates one document wrapper and production-scale typography", () => {
    const css = buildThemeCss("Test Church", normalizeBrandProfile());
    expect(css).toContain("body.sm-resource");
    expect(css).toContain(".sm-document { width: min(");
    expect(css).not.toContain(".sm-document, .sm-resource { max-width:");
    expect(css).toContain("font-size: 34px");
    expect(css).toContain("font-size: 20px");
  });
});
