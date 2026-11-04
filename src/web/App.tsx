import { useEffect, useId, useRef, useState } from "react";
import type { EvalRun, RunListItem } from "../core";
import sample from "../../sample-data/acme-support-bot.json";
import { deleteRun, detectMode, getRun, listRuns, runEvaluation, type Mode } from "./api";
import { CaseDetail } from "./components/CaseDetail";
import { ResultsTable } from "./components/ResultsTable";
import { Summary } from "./components/Summary";
import { downloadText, formatDate, pct, toCsv } from "./format";

const PLACEHOLDER = `[
  {
    "id": "refund-window",
    "question": "How long is the refund window?",
    "contexts": ["Annual plans can be refunded within 30 days."],
    "answer": "You can get a refund within 30 days."
  }
]`;

export function App() {
  const [mode, setMode] = useState<Mode | "checking">("checking");
  const [dataset, setDataset] = useState("");
  const [runName, setRunName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<EvalRun | null>(null);
  const [history, setHistory] = useState<RunListItem[]>([]);
  const [localRuns, setLocalRuns] = useState<EvalRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const datasetId = useId();
  const helpId = useId();
  const errorId = useId();

  useEffect(() => {
    detectMode().then(async (m) => {
      setMode(m);
      if (m === "api") setHistory(await listRuns().catch(() => []));
    });
  }, []);

  const selected = run?.results.find((r) => r.id === selectedId) ?? null;

  function loadSample() {
    setDataset(JSON.stringify(sample.cases, null, 2));
    setRunName(sample.name);
    setError(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setDataset(await file.text());
    if (!runName) setRunName(file.name.replace(/\.json$/i, ""));
    setError(null);
  }

  async function onRun() {
    if (mode === "checking" || running) return;
    if (!dataset.trim()) {
      setError("Paste a dataset, upload a JSON file, or load the sample first.");
      return;
    }
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(dataset);
    } catch {
      setError("The dataset isn't valid JSON. Check for missing commas or quotes.");
      return;
    }
    setRunning(true);
    try {
      const result = await runEvaluation(mode, runName, parsed);
      setRun(result);
      setSelectedId(null);
      if (mode === "api") setHistory(await listRuns());
      else setLocalRuns((runs) => [result, ...runs]);
      // Send focus to the results so screen-reader users hear that the run finished.
      requestAnimationFrame(() => resultsRef.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed.");
    } finally {
      setRunning(false);
    }
  }

  async function openRun(id: string) {
    setError(null);
    if (mode === "demo") {
      setRun(localRuns.find((r) => r.id === id) ?? null);
    } else {
      try {
        setRun(await getRun(id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load that run.");
      }
    }
    setSelectedId(null);
  }

  async function removeRun(id: string) {
    if (mode === "api") {
      await deleteRun(id);
      setHistory(await listRuns());
    } else {
      setLocalRuns((runs) => runs.filter((r) => r.id !== id));
    }
    if (run?.id === id) setRun(null);
  }

  const historyItems: RunListItem[] = mode === "api" ? history : localRuns;

  return (
    <>
      <a className="skip-link" href="#results">
        Skip to results
      </a>
      <header className="topbar">
        <div>
          <h1>RAG Eval Dashboard</h1>
          <p>Score retrieval-augmented answers for groundedness and relevance, and see exactly which sentences aren't backed by the context.</p>
        </div>
        <p className={`mode mode--${mode}`} role="status">
          {mode === "checking" && "Connecting…"}
          {mode === "api" && "Connected to API · runs are saved"}
          {mode === "demo" && "Demo mode · scoring runs in your browser"}
        </p>
      </header>

      <div className="layout">
        <aside className="panel" aria-labelledby="new-run-heading">
          <h2 id="new-run-heading">New evaluation</h2>
          <label className="field">
            <span>Run name</span>
            <input value={runName} onChange={(e) => setRunName(e.target.value)} placeholder="e.g. Support bot v2" />
          </label>

          <div className="field">
            <label htmlFor={datasetId}>Dataset (JSON)</label>
            <p id={helpId} className="help">
              An array of cases, each with <code>question</code>, <code>contexts</code> (retrieved chunks) and{" "}
              <code>answer</code>.
            </p>
            <textarea
              id={datasetId}
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={12}
              spellCheck={false}
              aria-describedby={error ? `${helpId} ${errorId}` : helpId}
              aria-invalid={error ? true : undefined}
            />
          </div>

          <div className="row">
            <button type="button" className="btn btn--ghost" onClick={loadSample}>
              Load sample dataset
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
              Upload JSON file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>

          {error && (
            <p id={errorId} className="error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={onRun}
            aria-disabled={running || mode === "checking" ? true : undefined}
          >
            {running ? "Evaluating…" : "Run evaluation"}
          </button>

          <h2 className="history-heading">Run history</h2>
          {historyItems.length === 0 ? (
            <p className="muted">No runs yet.</p>
          ) : (
            <ul className="history">
              {historyItems.map((item) => (
                <li key={item.id} className={item.id === run?.id ? "is-current" : undefined}>
                  <button type="button" className="history__open" onClick={() => openRun(item.id)}>
                    <span className="history__name">{item.name}</span>
                    <span className="history__meta">
                      {formatDate(item.createdAt)} · {pct(item.summary.passRate)} pass
                    </span>
                  </button>
                  <button
                    type="button"
                    className="history__delete"
                    aria-label={`Delete run ${item.name}`}
                    onClick={() => removeRun(item.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main id="results" className="main">
          {!run ? (
            <div className="empty">
              <h2 ref={resultsRef} tabIndex={-1}>
                No results yet
              </h2>
              <p>
                Load the sample dataset and run an evaluation to see how a customer-support bot scores, including two
                answers that invent numbers and one that answers from unrelated context.
              </p>
            </div>
          ) : (
            <>
              <div className="section-bar">
                <div>
                  <h2 ref={resultsRef} tabIndex={-1}>
                    {run.name}
                  </h2>
                  <p className="muted">
                    {formatDate(run.createdAt)} · {run.summary.total} cases · {run.scorer === "lexical" ? "lexical scorer" : "lexical + LLM judge"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => downloadText(`${run.name.replace(/\W+/g, "-").toLowerCase()}.csv`, toCsv(run))}
                >
                  Export CSV
                </button>
              </div>
              <Summary summary={run.summary} />
              <ResultsTable results={run.results} selectedId={selectedId} onSelect={setSelectedId} />
              {selected && <CaseDetail result={selected} onClose={() => setSelectedId(null)} />}
            </>
          )}
        </main>
      </div>
    </>
  );
}
