import { DEFAULT_THRESHOLDS, type EvalCase, type Thresholds } from "./types";

export const MAX_CASES = 500;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accepts either an array of cases or an object with a `cases` array, and returns
 * clean EvalCase objects. Throws ValidationError with a message that names the
 * offending case, so users can fix their file quickly.
 */
export function parseCases(input: unknown): EvalCase[] {
  const list = Array.isArray(input) ? input : isRecord(input) ? input.cases : undefined;
  if (!Array.isArray(list)) {
    throw new ValidationError('Expected a JSON array of cases, or an object with a "cases" array.');
  }
  if (list.length === 0) throw new ValidationError("The dataset has no cases.");
  if (list.length > MAX_CASES) throw new ValidationError(`Too many cases: ${list.length} (max ${MAX_CASES}).`);

  const seen = new Set<string>();
  return list.map((raw, index) => {
    const where = `Case ${index + 1}`;
    if (!isRecord(raw)) throw new ValidationError(`${where} is not an object.`);
    const { question, answer, contexts } = raw;
    if (typeof question !== "string" || !question.trim()) {
      throw new ValidationError(`${where} needs a non-empty "question" string.`);
    }
    if (typeof answer !== "string") throw new ValidationError(`${where} needs an "answer" string.`);
    if (!Array.isArray(contexts) || !contexts.every((c) => typeof c === "string")) {
      throw new ValidationError(`${where} needs "contexts" as an array of strings.`);
    }
    let id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `case-${index + 1}`;
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return { id, question: question.trim(), answer, contexts };
  });
}

/** Merges user-supplied thresholds over the defaults, ignoring anything outside 0-1. */
export function parseThresholds(input: unknown): Thresholds {
  const result = { ...DEFAULT_THRESHOLDS };
  if (!isRecord(input)) return result;
  for (const key of Object.keys(result) as Array<keyof Thresholds>) {
    const value = input[key];
    if (typeof value === "number" && value >= 0 && value <= 1) result[key] = value;
  }
  return result;
}
