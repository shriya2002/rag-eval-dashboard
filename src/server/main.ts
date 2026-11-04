import { createServer } from "node:http";
import { join } from "node:path";
import { createApp } from "./app";
import { createAnthropicJudge } from "./llmJudge";
import { JsonFileStore } from "./store";

const port = Number(process.env.PORT ?? 8787);
const dataFile = process.env.DATA_FILE ?? join(process.cwd(), "data", "runs.json");
const apiKey = process.env.ANTHROPIC_API_KEY;

const app = createApp({
  store: new JsonFileStore(dataFile),
  judge: apiKey ? createAnthropicJudge({ apiKey, model: process.env.JUDGE_MODEL }) : undefined,
  staticDir: join(process.cwd(), "web-dist"),
});

createServer(app).listen(port, () => {
  console.log(`RAG eval dashboard running at http://localhost:${port}`);
  console.log(apiKey ? "Scorer: lexical + LLM judge" : "Scorer: lexical (set ANTHROPIC_API_KEY to add an LLM judge)");
});
