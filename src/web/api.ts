import { evaluateCase, parseCases, summarize, DEFAULT_THRESHOLDS, type EvalRun, type RunListItem } from "../core";

/**
 * "api"  = talking to the Node server (runs are saved, optional LLM judge).
 * "demo" = no server reachable (e.g. the GitHub Pages build): scoring runs in the browser.
 */
export type Mode = "api" | "demo";

// Relative paths so the app works at "/" locally and under "/rag-eval-dashboard/" on GitHub Pages.
const API = "api";

export async function detectMode(): Promise<Mode> {
  try {
    const res = await fetch(`${API}/health`, { headers: { accept: "application/json" } });
    if (!res.ok) return "demo";
    const body = (await res.json()) as { ok?: boolean };
    return body.ok ? "api" : "demo";
  } catch {
    return "demo";
  }
}

async function errorFrom(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { error?: string };
    return new Error(body.error ?? `Request failed (${res.status}).`);
  } catch {
    return new Error(`Request failed (${res.status}).`);
  }
}

/** Evaluates a dataset. `raw` is the parsed JSON the user provided. */
export async function runEvaluation(mode: Mode, name: string, raw: unknown): Promise<EvalRun> {
  const body = Array.isArray(raw) ? { cases: raw } : { ...(raw as object) };
  const finalName = name.trim() || (typeof (body as { name?: unknown }).name === "string" ? (body as { name: string }).name : "Untitled run");

  if (mode === "api") {
    const res = await fetch(`${API}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, name: finalName }),
    });
    if (!res.ok) throw await errorFrom(res);
    return (await res.json()) as EvalRun;
  }

  const cases = parseCases(body); // throws a readable ValidationError
  const results = cases.map((c) => evaluateCase(c));
  return {
    id: crypto.randomUUID(),
    name: finalName,
    createdAt: new Date().toISOString(),
    scorer: "lexical",
    thresholds: DEFAULT_THRESHOLDS,
    summary: summarize(results),
    results,
  };
}

export async function listRuns(): Promise<RunListItem[]> {
  const res = await fetch(`${API}/runs`);
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as RunListItem[];
}

export async function getRun(id: string): Promise<EvalRun> {
  const res = await fetch(`${API}/runs/${encodeURIComponent(id)}`);
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as EvalRun;
}

export async function deleteRun(id: string): Promise<void> {
  const res = await fetch(`${API}/runs/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw await errorFrom(res);
}
