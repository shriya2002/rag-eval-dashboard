import type { CaseResult, EvalRun, Verdict } from "../core";

export const pct = (value: number) => `${Math.round(value * 100)}%`;

export const VERDICT_LABEL: Record<Verdict, string> = { pass: "Pass", review: "Review", fail: "Fail" };

/** Lower = worse; used to sort the most urgent cases to the top. */
export const VERDICT_RANK: Record<Verdict, number> = { fail: 0, review: 1, pass: 2 };

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(run: EvalRun): string {
  const header = ["id", "verdict", "groundedness", "context_relevance", "answer_relevance", "overall", "question", "reasons"];
  const rows = run.results.map((r: CaseResult) =>
    [r.id, r.verdict, r.groundedness, r.contextRelevance, r.answerRelevance, r.overall, r.question, r.reasons.join(" | ")]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
