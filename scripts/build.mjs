// Bundles the React app into web-dist/ with esbuild.
// The same build is served by the Node server and deployed to GitHub Pages (where it runs in demo mode).
import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";

await rm("web-dist", { recursive: true, force: true });
await mkdir("web-dist", { recursive: true });

await build({
  entryPoints: { app: "src/web/main.tsx" },
  bundle: true,
  minify: true,
  sourcemap: true,
  format: "esm",
  target: "es2020",
  jsx: "automatic",
  outdir: "web-dist",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

await writeFile(
  "web-dist/index.html",
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RAG Eval Dashboard</title>
    <meta name="description" content="Score retrieval-augmented generation answers for groundedness and relevance, sentence by sentence." />
    <link rel="stylesheet" href="./app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`,
);
