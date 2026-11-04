import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import {
  evaluateCase,
  parseCases,
  parseThresholds,
  summarize,
  ValidationError,
  type CaseResult,
  type EvalRun,
} from "../core";
import type { Judge } from "./llmJudge";
import type { RunStore } from "./store";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const JUDGE_CONCURRENCY = 4;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".svg": "image/svg+xml",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request body is larger than 2 MB.");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
}

/** Runs `fn` over `items` with at most `limit` in flight, preserving order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export interface AppOptions {
  store: RunStore;
  judge?: Judge;
  /** Folder with the built web app; served for every non-API path. */
  staticDir?: string;
}

/**
 * HTTP API:
 *   GET    /api/health     -> { ok, scorer }
 *   GET    /api/runs       -> run summaries, newest first
 *   POST   /api/runs       -> evaluate { name?, cases, thresholds? } and save the run
 *   GET    /api/runs/:id   -> full run with per-case results
 *   DELETE /api/runs/:id
 */
export function createApp({ store, judge, staticDir }: AppOptions): RequestListener {
  const scorer = judge ? "lexical+llm" : "lexical";

  async function handleApi(req: IncomingMessage, res: ServerResponse, path: string) {
    const method = req.method ?? "GET";

    if (path === "/api/health" && method === "GET") return sendJson(res, 200, { ok: true, scorer });

    if (path === "/api/runs") {
      if (method === "GET") return sendJson(res, 200, await store.list());
      if (method === "POST") {
        const body = await readJsonBody(req);
        const cases = parseCases(body);
        const record = (body ?? {}) as Record<string, unknown>;
        const thresholds = parseThresholds(record.thresholds);
        const name =
          typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 120) : "Untitled run";

        const results: CaseResult[] = await mapLimit(cases, JUDGE_CONCURRENCY, async (c) =>
          evaluateCase(c, thresholds, judge ? await judge(c) : undefined),
        );
        const run: EvalRun = {
          id: randomUUID(),
          name,
          createdAt: new Date().toISOString(),
          scorer,
          thresholds,
          summary: summarize(results),
          results,
        };
        await store.save(run);
        return sendJson(res, 201, run);
      }
      throw new HttpError(405, "Method not allowed.");
    }

    const match = path.match(/^\/api\/runs\/([\w-]+)$/);
    if (match) {
      const id = match[1];
      if (method === "GET") {
        const run = await store.get(id);
        return run ? sendJson(res, 200, run) : sendJson(res, 404, { error: "Run not found." });
      }
      if (method === "DELETE") {
        return (await store.delete(id))
          ? (res.writeHead(204), res.end())
          : sendJson(res, 404, { error: "Run not found." });
      }
      throw new HttpError(405, "Method not allowed.");
    }

    throw new HttpError(404, "Not found.");
  }

  async function handleStatic(res: ServerResponse, path: string) {
    if (!staticDir) throw new HttpError(404, "Not found.");
    const root = resolve(staticDir);
    let file = resolve(join(root, normalize(path)));
    if (!file.startsWith(root)) throw new HttpError(404, "Not found.");
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const data = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      // Single-page app: unknown paths fall back to index.html.
      const data = await readFile(join(root, "index.html"));
      res.writeHead(200, { "content-type": MIME[".html"] });
      res.end(data);
    }
  }

  return (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const handler = path.startsWith("/api/") || path === "/api" ? handleApi(req, res, path) : handleStatic(res, path);
    handler.catch((err: unknown) => {
      if (res.headersSent) return res.end();
      if (err instanceof ValidationError) return sendJson(res, 400, { error: err.message });
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      sendJson(res, 500, { error: "Something went wrong." });
    });
  };
}
