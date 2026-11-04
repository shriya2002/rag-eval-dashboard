import { useEffect, useRef } from "react";
import type { CaseResult } from "../../core";
import { pct } from "../format";
import { VerdictBadge } from "./ResultsTable";

export function CaseDetail({ result, onClose }: { result: CaseResult; onClose: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the detail panel when a new case opens, so keyboard and
  // screen-reader users land on what they just asked for.
  useEffect(() => {
    headingRef.current?.focus();
  }, [result.id]);

  const unsupportedCount = result.sentences.filter((s) => !s.supported).length;

  return (
    <section className="detail" aria-labelledby="detail-heading">
      <div className="section-bar">
        <h3 id="detail-heading" ref={headingRef} tabIndex={-1}>
          Case: {result.id}
        </h3>
        <div className="row">
          <VerdictBadge verdict={result.verdict} />
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close details
          </button>
        </div>
      </div>

      <h4>Question</h4>
      <p className="question">{result.question}</p>

      <h4>Why this verdict</h4>
      <ul className="reasons">
        {result.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <h4>
        Answer{" "}
        <span className="muted">
          {result.abstained
            ? "(model declined to answer)"
            : `(${result.sentences.length - unsupportedCount} of ${result.sentences.length} sentences supported)`}
        </span>
      </h4>
      <p className="answer" data-testid="answer">
        {result.sentences.length === 0 && <span className="muted">(empty answer)</span>}
        {result.sentences.map((s, i) => (
          <span key={i}>
            {s.supported || result.abstained ? (
              <span className="sentence">{s.sentence}</span>
            ) : (
              <mark className="sentence sentence--unsupported">
                <span className="visually-hidden">Unsupported: </span>
                {s.sentence}
              </mark>
            )}{" "}
          </span>
        ))}
      </p>
      {unsupportedCount > 0 && !result.abstained && (
        <ul className="sentence-notes">
          {result.sentences.map((s, i) =>
            s.supported ? null : (
              <li key={i}>
                <strong>Sentence {i + 1}:</strong> {pct(s.support)} of its key terms found in the best chunk
                {s.unsupportedNumbers.length > 0 && <> · numbers not in any chunk: {s.unsupportedNumbers.join(", ")}</>}
              </li>
            ),
          )}
        </ul>
      )}

      {result.judge && (
        <>
          <h4>LLM judge ({result.judge.model})</h4>
          <p>
            Groundedness {pct(result.judge.groundedness)}, relevance {pct(result.judge.relevance)}.{" "}
            {result.judge.explanation}
          </p>
        </>
      )}

      <h4>
        Retrieved context{" "}
        {result.contexts.length > 0 && (
          <span className="muted">
            ({result.contextScores.filter((score) => score >= 0.3).length} of {result.contexts.length} chunks on topic)
          </span>
        )}
      </h4>
      {result.contexts.length === 0 ? (
        <p className="muted">The retriever returned no chunks.</p>
      ) : (
        <ol className="contexts">
          {result.contexts.map((chunk, i) => {
            const score = result.contextScores[i] ?? 0;
            const supports = result.sentences
              .map((s, si) => (s.supported && s.bestContext === i ? si + 1 : null))
              .filter((n): n is number => n !== null);
            return (
              <li key={i} className="context">
                <div className="context__meta">
                  <span>Chunk {i + 1}</span>
                  <span className="context__score">
                    Relevance {pct(score)}
                    <span className="meter meter--small" aria-hidden="true">
                      <span style={{ width: pct(score) }} />
                    </span>
                  </span>
                </div>
                <p>{chunk}</p>
                {supports.length > 0 && (
                  <p className="context__supports">Supports answer sentence {supports.join(", ")}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
