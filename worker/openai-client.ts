type OpenAiOutputItem = { content?: Array<{ type?: string; text?: string }> };

type OpenAiEnvelope = {
  output_text?: string;
  output?: OpenAiOutputItem[];
  error?: { message?: string };
};

type StructuredRequestOptions<T> = {
  apiKey: string;
  body: Record<string, unknown>;
  operation: string;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
};

const MAX_ATTEMPTS = 2;

export async function callOpenAiStructured<T>({
  apiKey,
  body,
  operation,
  fetchImpl = fetch,
  retryDelayMs = 650,
}: StructuredRequestOptions<T>): Promise<T> {
  let lastFailure: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseText = await response.text();
      const envelope = parseEnvelope(responseText);

      if (!envelope) {
        const failure = new Error(`${operation} received a non-JSON response from the AI service (HTTP ${response.status}).`);
        if (attempt < MAX_ATTEMPTS && shouldRetry(response.status, responseText)) {
          lastFailure = failure;
          await delay(retryDelayMs);
          continue;
        }
        throw new Error(`${failure.message} Try again in a moment.`);
      }

      if (!response.ok) {
        const failure = new Error(envelope.error?.message || `${operation} failed (HTTP ${response.status}).`);
        if (attempt < MAX_ATTEMPTS && isTransientStatus(response.status)) {
          lastFailure = failure;
          await delay(retryDelayMs);
          continue;
        }
        throw failure;
      }

      const outputText = envelope.output_text || extractOutputText(envelope.output);
      if (!outputText) throw new Error(`${operation} returned no output.`);

      try {
        return JSON.parse(outputText) as T;
      } catch {
        const failure = new Error(
          looksLikeHtml(outputText)
            ? `${operation} received an HTML response instead of structured output.`
            : `${operation} returned invalid structured output.`,
        );
        if (attempt < MAX_ATTEMPTS) {
          lastFailure = failure;
          await delay(retryDelayMs);
          continue;
        }
        throw new Error(`${failure.message} Try again in a moment.`);
      }
    } catch (failure) {
      if (failure instanceof Error && isFinalFailure(failure)) throw failure;
      lastFailure = failure instanceof Error ? failure : new Error(`${operation} could not reach the AI service.`);
      if (attempt < MAX_ATTEMPTS) {
        await delay(retryDelayMs);
        continue;
      }
    }
  }

  throw new Error(`${lastFailure?.message || `${operation} failed.`} Try again in a moment.`);
}

function parseEnvelope(text: string): OpenAiEnvelope | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" ? value as OpenAiEnvelope : null;
  } catch {
    return null;
  }
}

function extractOutputText(output: OpenAiOutputItem[] | undefined) {
  return (output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text || "")
    .join("");
}

function isTransientStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function shouldRetry(status: number, body: string) {
  return isTransientStatus(status) || looksLikeHtml(body);
}

function looksLikeHtml(value: string) {
  return /^\s*(?:<!doctype\s+html|<html\b)/i.test(value);
}

function isFinalFailure(failure: Error) {
  return /Try again in a moment\.$/.test(failure.message)
    || /returned no output\.$/.test(failure.message)
    || /failed \(HTTP \d+\)\.$/.test(failure.message)
    || (!/fetch|network|connection|socket|timeout/i.test(failure.message) && !/could not reach/i.test(failure.message));
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
