import { buildIdf, round2, weightedCoverage } from "./similarity";
import { contentTokens, extractNumbers, isAbstention, splitSentences } from "./text";
import {
  DEFAULT_THRESHOLDS,
  type CaseResult,
  type EvalCase,
  type JudgeResult,
  type RunSummary,
  type SentenceCheck,
  type Thresholds,
  type Verdict,
} from "./types";

/** Weights for the overall score. Groundedness dominates: a fluent but invented answer is the worst outcome. */
const WEIGHTS = { groundedness: 0.5, contextRelevance: 0.25, answerRelevance: 0.25 };

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Scores one RAG response with three lexical metrics:
 *
 * - context relevance: did the retriever fetch chunks about the question?
 * - answer relevance: does the answer address the question?
 * - groundedness: is each answer sentence backed by a retrieved chunk, and do its
 *   numbers (prices, days, percentages) actually appear in the chunks?
 *
 * This is a fast, deterministic baseline that needs no API key. It can't catch
 * paraphrased support or subtle contradictions; pass an LLM judge result to blend
 * in a semantic second opinion.
 */
export function evaluateCase(
  input: EvalCase,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
  judge?: JudgeResult,
): CaseResult {
  const reasons: string[] = [];
  const question = contentTokens(input.question);
  const answer = contentTokens(input.answer);
  const contexts = input.contexts.map(contentTokens);
  const sentences = splitSentences(input.answer);
  const sentenceTokens = sentences.map(contentTokens);
  const idf = buildIdf([question, answer, ...contexts, ...sentenceTokens]);

  // 1. Context relevance
  const contextScores = contexts.map((c) => round2(weightedCoverage(question, c, idf)));
  const contextRelevance = mean(contextScores);
  if (input.contexts.length === 0) reasons.push("The retriever returned no context.");
  else if (contextRelevance < 0.3) reasons.push("Retrieved chunks are mostly unrelated to the question.");

  // 2. Answer relevance
  const abstained = isAbstention(input.answer);
  const answerRelevance = input.answer.trim() ? weightedCoverage(question, answer, idf) : 0;

  // 3. Groundedness, sentence by sentence
  const contextNumbers = new Set(input.contexts.flatMap(extractNumbers));
  const checks: SentenceCheck[] = sentences.map((sentence, i) => {
    let support = 0;
    let bestContext: number | null = null;
    for (let ci = 0; ci < contexts.length; ci++) {
      const s = weightedCoverage(sentenceTokens[i], contexts[ci], idf);
      if (bestContext === null || s > support) {
        support = s;
        bestContext = ci;
      }
    }
    const unsupportedNumbers = extractNumbers(sentence).filter((n) => !contextNumbers.has(n));
    return {
      sentence,
      support: round2(support),
      bestContext,
      unsupportedNumbers,
      supported: support >= thresholds.sentenceSupport && unsupportedNumbers.length === 0,
    };
  });

  let groundedness: number;
  if (!input.answer.trim()) {
    groundedness = 0;
    reasons.push("The answer is empty.");
  } else if (abstained) {
    // Declining to answer makes no claims, so nothing is ungrounded, but a person
    // should check whether the information really was missing.
    groundedness = 1;
    reasons.push("The model declined to answer. Check whether the context really lacked the information.");
  } else {
    groundedness = checks.length === 0 ? 0 : checks.filter((c) => c.supported).length / checks.length;
    const unsupported = checks.filter((c) => !c.supported);
    for (const c of unsupported) {
      if (c.unsupportedNumbers.length > 0) {
        reasons.push(`States ${c.unsupportedNumbers.join(", ")}, which appears in no retrieved chunk.`);
      }
    }
    const vague = unsupported.filter((c) => c.unsupportedNumbers.length === 0).length;
    if (vague > 0) {
      reasons.push(`${vague} of ${checks.length} answer sentence${checks.length === 1 ? "" : "s"} not supported by the context.`);
    }
  }
  if (!abstained && input.answer.trim() && answerRelevance < 0.4) {
    reasons.push("The answer doesn't directly address the question.");
  }

  // Blend in the LLM judge when available (simple average per metric).
  if (judge) {
    groundedness = (groundedness + judge.groundedness) / 2;
  }
  const finalAnswerRelevance = judge ? (answerRelevance + judge.relevance) / 2 : answerRelevance;

  const overall =
    WEIGHTS.groundedness * groundedness +
    WEIGHTS.contextRelevance * contextRelevance +
    WEIGHTS.answerRelevance * finalAnswerRelevance;

  let verdict: Verdict;
  if (groundedness < thresholds.failGroundedness) verdict = "fail";
  else if (abstained) verdict = "review";
  else if (overall >= thresholds.passOverall && groundedness >= thresholds.passGroundedness) verdict = "pass";
  else verdict = "review";

  if (verdict === "pass" && reasons.length === 0) reasons.push("Answer is relevant and fully supported by the context.");

  return {
    id: input.id,
    question: input.question,
    answer: input.answer,
    contexts: input.contexts,
    contextRelevance: round2(contextRelevance),
    contextScores,
    answerRelevance: round2(finalAnswerRelevance),
    groundedness: round2(groundedness),
    sentences: checks,
    abstained,
    overall: round2(overall),
    verdict,
    reasons,
    ...(judge ? { judge } : {}),
  };
}

export function summarize(results: CaseResult[]): RunSummary {
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  const passed = count("pass");
  return {
    total: results.length,
    passed,
    review: count("review"),
    failed: count("fail"),
    passRate: results.length ? round2(passed / results.length) : 0,
    avgGroundedness: round2(mean(results.map((r) => r.groundedness))),
    avgContextRelevance: round2(mean(results.map((r) => r.contextRelevance))),
    avgAnswerRelevance: round2(mean(results.map((r) => r.answerRelevance))),
    avgOverall: round2(mean(results.map((r) => r.overall))),
  };
}
