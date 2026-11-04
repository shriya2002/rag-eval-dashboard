/** One question/answer pair produced by a RAG system, plus the chunks it retrieved. */
export interface EvalCase {
  id: string;
  question: string;
  /** Retrieved chunks, in the order the retriever returned them. */
  contexts: string[];
  /** The answer the model generated from those chunks. */
  answer: string;
}

export interface Thresholds {
  /** How much of a sentence's meaning must be found in one chunk for it to count as supported (0-1). */
  sentenceSupport: number;
  /** Minimum overall score for a pass (0-1). */
  passOverall: number;
  /** Minimum groundedness for a pass (0-1). */
  passGroundedness: number;
  /** Groundedness below this is an automatic fail (0-1). */
  failGroundedness: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  sentenceSupport: 0.5,
  passOverall: 0.7,
  passGroundedness: 0.8,
  failGroundedness: 0.5,
};

export type Verdict = "pass" | "review" | "fail";

/** How well a single answer sentence is backed by the retrieved chunks. */
export interface SentenceCheck {
  sentence: string;
  /** Best support score against any single chunk (0-1). */
  support: number;
  /** Index of the chunk that supports the sentence best, or null if there are no chunks. */
  bestContext: number | null;
  /** Numbers in the sentence (prices, dates, percentages) that appear in no chunk. */
  unsupportedNumbers: string[];
  supported: boolean;
}

/** Optional second opinion from an LLM grader. */
export interface JudgeResult {
  model: string;
  groundedness: number;
  relevance: number;
  explanation: string;
}

export interface CaseResult {
  id: string;
  question: string;
  answer: string;
  contexts: string[];
  /** Relevance of the best retrieved chunk to the question (0-1). Low = retrieval missed. */
  contextRelevance: number;
  /** Share of retrieved chunks that are on topic (0-1). Low = the retriever fetched noise. */
  contextPrecision: number;
  /** Relevance of each chunk to the question (0-1), same order as `contexts`. */
  contextScores: number[];
  /** How directly the answer addresses the question (0-1). */
  answerRelevance: number;
  /** Share of answer sentences supported by the chunks (0-1). Low = likely hallucination. */
  groundedness: number;
  sentences: SentenceCheck[];
  /** True when the model declined to answer ("I don't know"). */
  abstained: boolean;
  overall: number;
  verdict: Verdict;
  /** Human-readable reasons behind the verdict. */
  reasons: string[];
  judge?: JudgeResult;
}

export interface RunSummary {
  total: number;
  passed: number;
  review: number;
  failed: number;
  passRate: number;
  avgGroundedness: number;
  avgContextRelevance: number;
  avgAnswerRelevance: number;
  avgOverall: number;
}

export interface EvalRun {
  id: string;
  name: string;
  createdAt: string;
  scorer: "lexical" | "lexical+llm";
  thresholds: Thresholds;
  summary: RunSummary;
  results: CaseResult[];
}

export type RunListItem = Pick<EvalRun, "id" | "name" | "createdAt" | "scorer" | "summary">;
