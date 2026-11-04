import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  evaluateCase,
  extractNumbers,
  isAbstention,
  parseCases,
  parseThresholds,
  splitSentences,
  summarize,
  ValidationError,
  DEFAULT_THRESHOLDS,
  type EvalCase,
} from "../src/core";

const sample = JSON.parse(readFileSync(new URL("../sample-data/acme-support-bot.json", import.meta.url), "utf8"));
const cases = parseCases(sample);
const byId = (id: string): EvalCase => {
  const found = cases.find((c) => c.id === id);
  assert.ok(found, `sample case ${id} exists`);
  return found;
};

describe("text helpers", () => {
  it("splits sentences without breaking on decimals", () => {
    assert.deepEqual(splitSentences("It costs $4.99 per month. Cancel any time!\nNo fees."), [
      "It costs $4.99 per month.",
      "Cancel any time!",
      "No fees.",
    ]);
  });

  it("extracts and normalizes numbers", () => {
    assert.deepEqual(extractNumbers("1,200 users, 15% off, version 2.5."), ["1200", "15%", "2.5"]);
  });

  it("detects abstentions", () => {
    assert.equal(isAbstention("I don't know the answer to that."), true);
    assert.equal(isAbstention("I couldn't find that in the docs."), true);
    assert.equal(isAbstention("The limit is 2 TB."), false);
  });
});

describe("evaluateCase", () => {
  it("passes a relevant, fully grounded answer", () => {
    const r = evaluateCase(byId("refund-window"));
    assert.equal(r.verdict, "pass");
    assert.equal(r.groundedness, 1);
    // The second chunk (monthly plans) is off-topic, so it should score lower than the first.
    assert.ok(r.contextScores[0] > r.contextScores[1], `contextScores ${r.contextScores}`);
    assert.ok(r.answerRelevance > 0.5, `answerRelevance ${r.answerRelevance}`);
    assert.ok(r.sentences.every((s) => s.supported));
  });

  it("fails an answer that invents numbers", () => {
    const r = evaluateCase(byId("refund-window-hallucinated"));
    assert.equal(r.verdict, "fail");
    assert.deepEqual(r.sentences.map((s) => s.unsupportedNumbers), [["60"], ["20%"]]);
    assert.ok(r.reasons.some((m) => m.includes("60")));
  });

  it("catches a single wrong price even when the wording matches", () => {
    const r = evaluateCase(byId("seat-price-wrong-number"));
    assert.equal(r.verdict, "fail");
    assert.deepEqual(r.sentences[0].unsupportedNumbers, ["10"]);
  });

  it("flags irrelevant retrieval and an unsupported claim", () => {
    const r = evaluateCase(byId("sso-off-topic-retrieval"));
    assert.equal(r.verdict, "fail");
    assert.ok(r.contextRelevance < 0.3, `contextRelevance ${r.contextRelevance}`);
    assert.ok(r.reasons.some((m) => m.includes("unrelated")));
  });

  it("sends abstentions to human review instead of failing them", () => {
    const r = evaluateCase(byId("sso-declined"));
    assert.equal(r.abstained, true);
    assert.equal(r.verdict, "review");
  });

  it("marks only the unsupported sentence in a partly grounded answer", () => {
    const r = evaluateCase(byId("file-size-partial"));
    assert.deepEqual(r.sentences.map((s) => s.supported), [true, true, false]);
    assert.equal(r.verdict, "review");
    assert.ok(Math.abs(r.groundedness - 0.67) < 0.01);
  });

  it("handles empty answers and missing context", () => {
    const r = evaluateCase({ id: "x", question: "What is the limit?", contexts: [], answer: "" });
    assert.equal(r.verdict, "fail");
    assert.equal(r.groundedness, 0);
    assert.ok(r.reasons.includes("The retriever returned no context."));
    assert.ok(r.reasons.includes("The answer is empty."));
  });

  it("blends in an LLM judge score when provided", () => {
    const base = evaluateCase(byId("refund-window"));
    const judged = evaluateCase(byId("refund-window"), DEFAULT_THRESHOLDS, {
      model: "test",
      groundedness: 0,
      relevance: 0,
      explanation: "test",
    });
    assert.equal(judged.groundedness, 0.5);
    assert.ok(judged.overall < base.overall);
    assert.equal(judged.judge?.model, "test");
  });
});

describe("summarize", () => {
  it("counts verdicts across the sample run", () => {
    const summary = summarize(cases.map((c) => evaluateCase(c)));
    assert.equal(summary.total, 8);
    assert.equal(summary.passed + summary.review + summary.failed, 8);
    assert.equal(summary.passed, 3);
    assert.equal(summary.failed, 3);
    assert.equal(summary.review, 2);
    assert.equal(summary.passRate, 0.38);
  });
});

describe("validation", () => {
  it("accepts an array or a { cases } object and generates missing ids", () => {
    const parsed = parseCases([{ question: "Q?", answer: "A.", contexts: ["C."] }]);
    assert.equal(parsed[0].id, "case-1");
    assert.equal(parseCases({ cases: [{ question: "Q?", answer: "A.", contexts: [] }] }).length, 1);
  });

  it("de-duplicates repeated ids", () => {
    const parsed = parseCases([
      { id: "a", question: "Q?", answer: "A.", contexts: [] },
      { id: "a", question: "Q?", answer: "A.", contexts: [] },
    ]);
    assert.deepEqual(parsed.map((c) => c.id), ["a", "a-2"]);
  });

  it("names the broken case in its error message", () => {
    assert.throws(
      () => parseCases([{ question: "Q?", answer: "A.", contexts: [] }, { question: "", answer: "A.", contexts: [] }]),
      (err: unknown) => err instanceof ValidationError && err.message.startsWith("Case 2"),
    );
    assert.throws(() => parseCases({}), ValidationError);
    assert.throws(() => parseCases([]), ValidationError);
  });

  it("ignores out-of-range thresholds", () => {
    const t = parseThresholds({ passOverall: 0.9, failGroundedness: 7 });
    assert.equal(t.passOverall, 0.9);
    assert.equal(t.failGroundedness, DEFAULT_THRESHOLDS.failGroundedness);
  });
});
