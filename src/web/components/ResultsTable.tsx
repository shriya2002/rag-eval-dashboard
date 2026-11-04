import { useMemo, useState } from "react";
import type { CaseResult, Verdict } from "../../core";
import { pct, VERDICT_LABEL, VERDICT_RANK } from "../format";

type SortKey = "id" | "verdict" | "groundedness" | "contextRelevance" | "answerRelevance" | "overall";
type Filter = "all" | Verdict;

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: "id", label: "Case" },
  { key: "verdict", label: "Verdict" },
  { key: "groundedness", label: "Groundedness", numeric: true },
  { key: "contextRelevance", label: "Context rel.", numeric: true },
  { key: "answerRelevance", label: "Answer rel.", numeric: true },
  { key: "overall", label: "Overall", numeric: true },
];

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={`badge badge--${verdict}`}>{VERDICT_LABEL[verdict]}</span>;
}

export function ResultsTable({
  results,
  selectedId,
  onSelect,
}: {
  results: CaseResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "verdict", dir: "asc" });

  const counts = useMemo(() => {
    const c = { all: results.length, pass: 0, review: 0, fail: 0 };
    for (const r of results) c[r.verdict]++;
    return c;
  }, [results]);

  const rows = useMemo(() => {
    const filtered = filter === "all" ? results : results.filter((r) => r.verdict === filter);
    const value = (r: CaseResult): number | string =>
      sort.key === "id" ? r.id : sort.key === "verdict" ? VERDICT_RANK[r.verdict] * 10 + r.overall : r[sort.key];
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === "string" ? va.localeCompare(String(vb)) : va - (vb as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [results, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <section aria-labelledby="results-heading">
      <div className="section-bar">
        <h3 id="results-heading">Cases</h3>
        <fieldset className="segmented">
          <legend className="visually-hidden">Show cases</legend>
          {(["all", "fail", "review", "pass"] as const).map((f) => (
            <label key={f}>
              <input
                type="radio"
                name="verdict-filter"
                value={f}
                checked={filter === f}
                onChange={() => setFilter(f)}
              />
              <span>
                {f === "all" ? "All" : VERDICT_LABEL[f]} ({counts[f]})
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className="table-wrap">
        <table className="results">
          <caption className="visually-hidden">
            Evaluation results, sorted by {COLUMNS.find((c) => c.key === sort.key)?.label}{" "}
            {sort.dir === "asc" ? "ascending" : "descending"}
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={col.numeric ? "num" : undefined}
                  aria-sort={sort.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button type="button" className="sort" onClick={() => toggleSort(col.key)}>
                    {col.label}
                    <span aria-hidden="true" className="sort__icon">
                      {sort.key === col.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="empty-row">
                  No cases match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={r.id === selectedId ? "is-selected" : undefined}>
                <td>
                  <button
                    type="button"
                    className="case-link"
                    aria-pressed={r.id === selectedId}
                    onClick={() => onSelect(r.id)}
                  >
                    <span className="case-link__id">{r.id}</span>
                    <span className="case-link__q">{r.question}</span>
                  </button>
                </td>
                <td>
                  <VerdictBadge verdict={r.verdict} />
                </td>
                <td className="num">{pct(r.groundedness)}</td>
                <td className="num">{pct(r.contextRelevance)}</td>
                <td className="num">{pct(r.answerRelevance)}</td>
                <td className="num strong">{pct(r.overall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
