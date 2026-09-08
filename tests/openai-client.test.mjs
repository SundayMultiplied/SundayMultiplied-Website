import assert from "node:assert/strict";
import test from "node:test";
import { callOpenAiStructured } from "../worker/openai-client.ts";

function successfulResponse(value) {
  return new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("parses structured output from the Responses API envelope", async () => {
  const result = await callOpenAiStructured({
    apiKey: "test-key",
    body: { model: "test" },
    operation: "Resource generation",
    retryDelayMs: 0,
    fetchImpl: async () => successfulResponse({ resources: { family: "<html></html>" } }),
  });
  assert.deepEqual(result, { resources: { family: "<html></html>" } });
});

test("retries once when the upstream response is an HTML error page", async () => {
  let calls = 0;
  const result = await callOpenAiStructured({
    apiKey: "test-key",
    body: { model: "test" },
    operation: "Resource generation",
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("<!DOCTYPE html><title>Bad gateway</title>", { status: 502, headers: { "content-type": "text/html" } })
        : successfulResponse({ ok: true });
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: true });
});

test("replaces persistent HTML parser failures with an actionable error", async () => {
  let calls = 0;
  await assert.rejects(
    callOpenAiStructured({
      apiKey: "test-key",
      body: { model: "test" },
      operation: "Resource generation",
      retryDelayMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return new Response("<!DOCTYPE html><title>Unavailable</title>", { status: 502, headers: { "content-type": "text/html" } });
      },
    }),
    /Resource generation received a non-JSON response from the AI service \(HTTP 502\)\. Try again in a moment\./,
  );
  assert.equal(calls, 2);
});
