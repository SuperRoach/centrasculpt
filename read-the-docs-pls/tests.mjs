import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tools } from "../scripts/agent-schemas.mjs";
const root = dirname(fileURLToPath(import.meta.url));
const pages = JSON.parse(await readFile(resolve(root, "content.json"), "utf8"));
const read = (f) => readFile(resolve(root, f), "utf8");
const routes = JSON.parse(await read("routes.json"));
test("stable public routes are unique, intentional and fully generated", async () => {
  assert.deepEqual(
    pages.map((p) => `${p.id}.html`),
    routes,
  );
  assert.equal(new Set(routes).size, routes.length);
  assert.equal(routes.length, 26);
  assert.deepEqual(JSON.parse(await read("dist/routes.json")), routes);
});
test("every internal link, fragment, script and stylesheet resolves inside output", async () => {
  for (const route of routes) {
    const html = await read(`dist/${route}`);
    for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^https?:/.test(href)) continue;
      assert.ok(!href.startsWith("/"), `root-absolute path: ${href}`);
      const [file, hash] = href.split("#");
      const target = file || route;
      await access(resolve(root, "dist", target));
      if (hash)
        assert.ok((await read(`dist/${target}`)).includes(`id="${hash}"`), `${route} -> ${href}`);
    }
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${route}: duplicate IDs`);
  }
});
test("each page has language, unique title, landmarks, skip link, current navigation and reading links", async () => {
  for (const route of routes) {
    const html = await read(`dist/${route}`);
    for (const marker of [
      'lang="en-AU"',
      'name="viewport"',
      'class="skip"',
      'id="main"',
      'aria-label="All guides"',
      'aria-label="Breadcrumb"',
      'aria-label="Previous and next guides"',
      "data-pagefind-body",
      'aria-controls="sidebar"',
      'aria-labelledby="search-title"',
    ])
      assert.ok(html.includes(marker), `${route}: ${marker}`);
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  }
});
test("Pagefind builds real index fragments, metadata and browser assets", async () => {
  const files = await readdir(resolve(root, "dist/pagefind"));
  for (const f of ["pagefind.js", "pagefind-ui.js", "pagefind-entry.json"])
    assert.ok(files.includes(f));
  assert.ok((await readdir(resolve(root, "dist/pagefind/fragment"))).length >= pages.length);
  const entry = JSON.parse(await read("dist/pagefind/pagefind-entry.json"));
  assert.ok(entry.languages["en-au"]);
});
test("critical topics, commands, format units and deferred boundaries are documented", () => {
  const by = (id) => pages.find((p) => p.id === id).body;
  const topics = {
    "tool-wheel": [
      "Clay",
      "Smooth",
      "Flatten",
      "Inflate",
      "Stamp",
      "Move Tool",
      "Tube",
      "Transform Layer",
      "Cut",
      "Paint",
      "Mask",
      "World Settings",
      "Live Boolean Shapes",
    ],
    desktop: ["Cmd/Ctrl + Z", "Cmd/Ctrl + Shift + Z", "E / D / C", "R / F / V", "G / T"],
    quest: ["Support stick left/right", "Support stick up/down", "Both grips", "adb reverse"],
    primitives: ["Cone", "Capsule", "Torus", "Tyre shape", "Pyramid"],
    export: [
      "Actual size (1:1)",
      "200 mm",
      "millimetres",
      "metres",
      "192³",
      "256³",
      "fallback",
      "0.025",
      "Current layer",
      "All visible layers",
      "Unified Boolean",
      "triangle",
      "memory",
    ],
    projects: [".form", "recovery", "browser profile", "personal-shapes", "Save selected as Shape", "lossless gzip", "Base centre"],
    agents: [
      "config.toml",
      "mcp.json",
      "dev:agent",
      "Approve connection",
      "Allow editing",
      "get_capabilities",
    ],
    faq: ["Personal Shapes", "8.0.1", "8.1", "8.2", "Quest hardware"],
  };
  for (const [id, words] of Object.entries(topics))
    for (const word of words) assert.ok(by(id).includes(word), `${id} missing ${word}`);
});
test("holder proposal and documented tool arguments validate against CURRENT executable MCP schemas", () => {
  const body = pages.find((p) => p.id === "holder").body;
  const code = body
    .match(/<pre><code>(\{[\s\S]*?)<\/code><\/pre>/)[1]
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
  const proposal = JSON.parse(code);
  tools.propose_changes.schema.parse(proposal);
  assert.equal(proposal.steps.length, 14);
  assert.equal(proposal.steps.filter((s) => s.command.type === "primitive.create").length, 5);
  for (const line of body.split("\n")) {
    const m = line.match(
      /^(get_proposal|apply_approved_proposal|get_booleans|get_bounds|capture_scene_preview|undo) (\{.*\})/,
    );
    if (m) tools[m[1]].schema.parse(JSON.parse(m[2].replaceAll("&quot;", '"')));
  }
});
test("documentation source facts still match app bindings and limits", async () => {
  const toolSource = await read("../src/editor-tool-state.ts");
  assert.ok(
    toolSource.includes(
      '["clay", "smooth", "flatten", "inflate", "stamp", "move", "tube", "transform"]',
    ),
  );
  assert.ok(toolSource.includes('id: "cut", label: "Cut"'));
  const shortcuts = await read("../src/xr-support-shortcuts.ts");
  for (const action of ['action: "undo"', 'action: "redo"', 'menu: "tool-wheel"', 'menu: "layers"'])
    assert.ok(shortcuts.includes(action));
  assert.ok((await read("../src/project.ts")).includes("MAX_PROJECT_LAYERS = 16"));
  assert.ok((await read("../src/export-dialog.ts")).includes("Actual size (1:1)"));
});

test('real screenshot assets have consistent pixels, captions and capture provenance', async () => {
  const manifest = JSON.parse(await read('screenshots/manifest.json'));
  assert.ok(manifest.length >= 12);
  const names = new Set(manifest.map(x=>x.name));
  for (const name of ['workspace','clay-before','clay-after','primitives','layers','booleans','arrays','precision','enclosures','assemblies','library','export']) assert.ok(names.has(name));
  for (const item of manifest) {
    const png = await readFile(resolve(root,'screenshots',item.name+'.png'));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),1600);
    assert.equal(png.readUInt32BE(20),1000);
    assert.ok(item.caption && item.captured && item.url.startsWith('http://127.0.0.1:'));
  }
  for (const page of pages) for(const match of page.body.matchAll(/<img [^>]+>/g)) {
    assert.match(match[0],/alt="[^"]+"/);
    assert.match(match[0],/width="1600" height="1000"/);
  }
});
