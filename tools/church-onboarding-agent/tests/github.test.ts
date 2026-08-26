import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnboardingPullRequest } from "../src/services/github";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub onboarding pull request", () => {
  it("creates the entire church workspace in one commit", async () => {
    const responses = [
      { object: { sha: "base-commit" } },
      { tree: { sha: "base-tree" } },
      { sha: "workspace-tree" },
      { sha: "workspace-commit" },
      {},
      { html_url: "https://github.com/SundayMultiplied/SundayMultiplied-Website/pull/99" },
    ];
    const fakeFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response(JSON.stringify(responses.shift()), { status: 200 })
    ));
    vi.stubGlobal("fetch", fakeFetch);

    const result = await createOnboardingPullRequest(
      {
        owner: "SundayMultiplied",
        repo: "SundayMultiplied-Website",
        baseBranch: "main",
        token: "test-token",
      },
      "test-church",
      "Test Church",
      [
        { path: "churches/test-church/church.json", content: "{}" },
        { path: "churches/test-church/styles/test-church.css", content: ":root {}" },
      ],
    );

    expect(result.pullRequestUrl).toContain("/pull/99");
    expect(fakeFetch).toHaveBeenCalledTimes(6);

    const treeRequest = fakeFetch.mock.calls[2]?.[1] as RequestInit;
    const treePayload = JSON.parse(String(treeRequest.body));
    expect(treePayload.base_tree).toBe("base-tree");
    expect(treePayload.tree).toHaveLength(2);
    expect(treePayload.tree[0]).toMatchObject({
      path: "churches/test-church/church.json",
      mode: "100644",
      type: "blob",
      content: "{}",
    });

    const urls = fakeFetch.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/contents/"))).toBe(false);
  });
});
