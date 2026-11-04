import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { EvalRun, RunListItem } from "../src/core";
import { createApp } from "../src/server/app";
import { createAnthropicJudge, parseJudgeReply } from "../src/server/llmJudge";
import { JsonFileStore, MemoryStore } from "../src/server/store";

const sample = JSON.parse(readFileSync(new URL("../sample-data/acme-support-bot.json", import.meta.url), "utf8"));

async function start(app: ReturnType<typeof createApp>): Promise<{ server: Server; url: string }> {
  const server = createServer(app);
  await new Promise<void>((done) => server.listen(0, done));
  return { server, url: `http://localhost:${(server.address() as AddressInfo).port}` };
}

describe("HTTP API", () => {
  let server: Server;
  let url: string;

  before(async () => {
    ({ server, url } = await start(createApp({ store: new MemoryStore() })));
  });
  after(() => server.close());

  it("reports health and scorer type", async () => {
    const res = await fetch(`${url}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, scorer: "lexical" });
  });

  it("evaluates, saves, lists, fetches and deletes a run", async () => {
    const created = await fetch(`${url}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sample),
    });
    assert.equal(created.status, 201);
    const run = (await created.json()) as EvalRun;
    assert.equal(run.name, sample.name);
    assert.equal(run.summary.total, 8);
    assert.equal(run.results.length, 8);

    const list = (await (await fetch(`${url}/api/runs`)).json()) as RunListItem[];
    assert.equal(list[0].id, run.id);
    assert.equal("results" in list[0], false, "list omits per-case results");

    const fetched = (await (await fetch(`${url}/api/runs/${run.id}`)).json()) as EvalRun;
    assert.equal(fetched.results[0].id, "refund-window");

    assert.equal((await fetch(`${url}/api/runs/${run.id}`, { method: "DELETE" })).status, 204);
    assert.equal((await fetch(`${url}/api/runs/${run.id}`)).status, 404);
  });

  it("returns clear 400 errors for bad input", async () => {
    const badJson = await fetch(`${url}/api/runs`, { method: "POST", body: "{not json" });
    assert.equal(badJson.status, 400);
    assert.match(((await badJson.json()) as { error: string }).error, /valid JSON/);

    const badCase = await fetch(`${url}/api/runs`, {
      method: "POST",
      body: JSON.stringify({ cases: [{ question: "Q?", answer: "A." }] }),
    });
    assert.equal(badCase.status, 400);
    assert.match(((await badCase.json()) as { error: string }).error, /Case 1 needs "contexts"/);
  });

  it("rejects oversized bodies and unknown routes", async () => {
    const big = await fetch(`${url}/api/runs`, { method: "POST", body: "x".repeat(2 * 1024 * 1024 + 10) });
    assert.equal(big.status, 413);
    assert.equal((await fetch(`${url}/api/nope`)).status, 404);
    assert.equal((await fetch(`${url}/api/runs`, { method: "PUT" })).status, 405);
  });
});

describe("LLM judge", () => {
  it("parses a valid reply and clamps scores into 0-1", () => {
    const r = parseJudgeReply('Sure! {"groundedness": 1.4, "relevance": 0.5, "explanation": "ok"}', "m");
    assert.deepEqual(r, { model: "m", groundedness: 1, relevance: 0.5, explanation: "ok" });
    assert.equal(parseJudgeReply("no json here", "m"), undefined);
    assert.equal(parseJudgeReply('{"groundedness": "high"}', "m"), undefined);
  });

  it("calls the API with the case and blends its score into the run", async () => {
    let requestBody = "";
    const fakeFetch: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body);
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: '{"groundedness":0,"relevance":0,"explanation":"invented"}' }] }),
        { status: 200 },
      );
    };
    const judge = createAnthropicJudge({ apiKey: "test", model: "test-model", fetchImpl: fakeFetch });
    const { server, url } = await start(createApp({ store: new MemoryStore(), judge }));
    try {
      const res = await fetch(`${url}/api/runs`, {
        method: "POST",
        body: JSON.stringify({ cases: [sample.cases[0]] }),
      });
      const run = (await res.json()) as EvalRun;
      assert.equal(run.scorer, "lexical+llm");
      assert.equal(run.results[0].judge?.model, "test-model");
      assert.equal(run.results[0].groundedness, 0.5); // lexical 1 averaged with judge 0
      assert.match(requestBody, /How many days do I have to request a refund/);
    } finally {
      server.close();
    }
  });

  it("falls back to lexical scoring when the API fails", async () => {
    const failing: typeof fetch = async () => new Response("overloaded", { status: 529 });
    const judge = createAnthropicJudge({ apiKey: "test", fetchImpl: failing });
    assert.equal(await judge(sample.cases[0]), undefined);
  });
});

describe("JsonFileStore", () => {
  it("persists runs across restarts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rag-eval-"));
    const file = join(dir, "runs.json");
    try {
      const first = new JsonFileStore(file);
      const run = { id: "r1", name: "n", createdAt: new Date().toISOString() } as EvalRun;
      await first.save(run);
      assert.match(await readFile(file, "utf8"), /"r1"/);

      const second = new JsonFileStore(file);
      assert.equal((await second.get("r1"))?.name, "n");
      assert.equal(await second.delete("r1"), true);
      assert.equal((await new JsonFileStore(file).list()).length, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
