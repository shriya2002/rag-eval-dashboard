import type { RunSummary } from "../../core";
import { pct } from "../format";

function Metric({ label, value, hint }: { label: string; value: number; hint: string }) {
  const tone = value >= 0.8 ? "good" : value >= 0.5 ? "ok" : "bad";
  return (
    <div className={`metric metric--${tone}`}>
      <dt>{label}</dt>
      <dd>
        <span className="metric__value">{pct(value)}</span>
        <span className="meter" aria-hidden="true">
          <span style={{ width: pct(value) }} />
        </span>
        <span className="metric__hint">{hint}</span>
      </dd>
    </div>
  );
}

export function Summary({ summary }: { summary: RunSummary }) {
  return (
    <section aria-labelledby="summary-heading">
      <h3 id="summary-heading" className="visually-hidden">
        Summary
      </h3>
      <dl className="metrics">
        <Metric
          label="Pass rate"
          value={summary.passRate}
          hint={`${summary.passed} pass · ${summary.review} review · ${summary.failed} fail`}
        />
        <Metric label="Groundedness" value={summary.avgGroundedness} hint="Answer claims backed by context" />
        <Metric label="Context relevance" value={summary.avgContextRelevance} hint="Retrieved chunks on topic" />
        <Metric label="Answer relevance" value={summary.avgAnswerRelevance} hint="Answers address the question" />
      </dl>
    </section>
  );
}
