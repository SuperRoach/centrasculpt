import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { test } from "node:test";
import { docsMiddleware } from "../scripts/docs-vite.mjs";

// Run after npm run build, as in npm run check: verify the actual deployable output.
test("the app build includes the complete guide and generated search, without QA endpoints", async () => {
  const routes = JSON.parse(await readFile("read-the-docs-pls/routes.json", "utf8"));
  for (const route of routes) {
    const html = await readFile(`dist/read-the-docs/${route}`, "utf8");
    assert.match(html, /data-pagefind-body/);
    assert.match(html, /href="pagefind\/pagefind-ui.css"/);
  }
  for (const asset of ["style.css", "app.js", "favicon.svg", "pagefind/pagefind.js"]) {
    assert.ok((await readFile(`dist/read-the-docs/${asset}`)).length);
  }
  await assert.rejects(readFile("dist/read-the-docs/browser-qa.html"), { code: "ENOENT" });
  const ui = await readFile("src/ui.ts", "utf8");
  assert.match(ui, /id="project-help" href="\$\{import.meta.env.BASE_URL\}read-the-docs\/"/);
  assert.match(ui, /target="_blank" rel="noopener" aria-label="Help — opens in a new tab"/);
});

test("development guide routing serves assets, redirects the directory and refuses missing or escaping paths", async () => {
  const middleware = docsMiddleware(resolve("dist/read-the-docs"), "/sculpt/");
  const server = createServer((req, res) => middleware(req, res, () => res.writeHead(418).end()));
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const redirect = await fetch(`${origin}/sculpt/read-the-docs?from=help`, {
      redirect: "manual",
    });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "/sculpt/read-the-docs/?from=help");
    const index = await fetch(`${origin}/sculpt/read-the-docs/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /A space to shape/);
    const script = await fetch(`${origin}/sculpt/read-the-docs/pagefind/pagefind.js`);
    assert.equal(script.status, 200);
    assert.equal(script.headers.get("content-type"), "text/javascript");
    const head = await fetch(`${origin}/sculpt/read-the-docs/`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    assert.equal((await fetch(`${origin}/sculpt/read-the-docs/missing.html`)).status, 404);
    assert.equal((await fetch(`${origin}/sculpt/read-the-docs/%2e%2e%2findex.html`)).status, 403);
    assert.equal((await fetch(`${origin}/sculpt/read-the-docs/`, { method: "POST" })).status, 405);
    assert.equal((await fetch(`${origin}/sculpt/editor`)).status, 418);
  } finally {
    await new Promise((done) => server.close(done));
  }
});
