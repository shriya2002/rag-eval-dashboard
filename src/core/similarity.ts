// Weighted term overlap. Rare words ("refund", "SSO") count more than common ones
// ("account", "use") thanks to inverse document frequency (IDF).

export type Idf = Map<string, number>;

/** Builds IDF weights from a small corpus of tokenized documents. */
export function buildIdf(docs: string[][]): Idf {
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = docs.length;
  const idf: Idf = new Map();
  for (const [term, count] of df) idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
  return idf;
}

/**
 * What share of the query's meaning (IDF-weighted unique terms) appears in the target?
 * 1 = every important query term is present; 0 = none are.
 * Asymmetric on purpose: a long chunk isn't penalised for containing extra text.
 */
export function weightedCoverage(query: string[], target: string[], idf: Idf): number {
  const terms = new Set(query);
  if (terms.size === 0) return 0;
  const targetSet = new Set(target);
  let total = 0;
  let covered = 0;
  for (const term of terms) {
    const w = idf.get(term) ?? 1;
    total += w;
    if (targetSet.has(term)) covered += w;
  }
  return covered / total;
}

/** Rounds to two decimals for display and stable test output. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
