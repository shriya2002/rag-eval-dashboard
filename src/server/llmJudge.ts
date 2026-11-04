import type { EvalCase, JudgeResult } from "../core";

/** Grades one case semantically. Returns undefined if the judge is unavailable or its reply can't be parsed. */
export type Judge = (input: EvalCase) => Promise<JudgeResult | undefined>;

const PROMPT = `You are grading the output of a retrieval-augmented generation (RAG) system.
Given a QUESTION, the retrieved CONTEXT chunks, and the ANSWER, rate:
- groundedness: 0 to 1, the share of the answer's claims that the context supports. Claims not in the context count against it, even if true.
- relevance: 0 to 1, how directly the answer addresses the question.
Reply with only a JSON object: {"groundedness": number, "relevance": number, "explanation": "one sentence"}`;

function clamp01(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}

/** Pulls the first JSON object out of a model reply and validates it. */
export function parseJudgeReply(text: string, model: string): JudgeResult | undefined {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    const data = JSON.parse(match[0]) as Record<string, unknown>;
    const groundedness = clamp01(data.groundedness);
    const relevance = clamp01(data.relevance);
    if (groundedness === undefined || relevance === undefined) return undefined;
    const explanation = typeof data.explanation === "string" ? data.explanation : "";
    return { model, groundedness, relevance, explanation };
  } catch {
    return undefined;
  }
}

/**
 * Builds an LLM judge backed by the Anthropic Messages API.
 * Only used when ANTHROPIC_API_KEY is set; otherwise the dashboard runs the
 * lexical scorer alone. `fetchImpl` is injectable so tests never hit the network.
 */
export function createAnthropicJudge(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Judge {
  const model = options.model ?? "claude-haiku-4-5-20251001";
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;

  return async (input) => {
    const context = input.contexts.map((c, i) => `[${i + 1}] ${c}`).join("\n");
    try {
      const res = await doFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "content-type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 200,
          system: PROMPT,
          messages: [
            {
              role: "user",
              content: `QUESTION:\n${input.question}\n\nCONTEXT:\n${context || "(none)"}\n\nANSWER:\n${input.answer}`,
            },
          ],
        }),
      });
      if (!res.ok) return undefined;
      const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = body.content?.find((part) => part.type === "text")?.text ?? "";
      return parseJudgeReply(text, model);
    } catch {
      return undefined; // network error or timeout: fall back to lexical scoring for this case
    }
  };
}
