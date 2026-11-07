// Run after opening a disposable dev:agent editor and approving its read-only connection.
// Captures existing geometry; never enables editing or changes view/objects.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const output = "work/phase-7-4-2";
await mkdir(output, { recursive: true });
const client = new Client({ name: "centra-visual-smoke", version: "1" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [resolve("scripts/agent-mcp.mjs")],
    env: { ...process.env },
    stderr: "pipe",
  }),
);
const call = async (name, args = {}) => client.callTool({ name, arguments: args });
try {
  const before = (await call("scene_summary")).structuredContent;
  assert(before.ok, `Approve the disposable browser session first: ${JSON.stringify(before)}`);
  const objects = (await call("list_objects")).structuredContent;
  const reports = [];
  for (const viewpoint of ["front", "isometric", "top"]) {
    const result = await call("capture_scene_preview", {
      expectedRevision: before.revision,
      viewpoint,
      width: 512,
      height: 384,
    });
    assert(result.structuredContent.ok, JSON.stringify(result.structuredContent));
    const image = result.content.find((block) => block.type === "image");
    assert(image);
    assert.equal(image.mimeType, "image/png");
    const png = Buffer.from(image.data, "base64");
    const meta = result.structuredContent.value;
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 384);
    assert.equal(png.length, meta.bytes);
    assert(png.length <= 524288);
    assert(!JSON.stringify(result.structuredContent).includes(image.data));
    assert.equal(meta.renderState, "current");
    assert.equal(meta.revision, before.revision);
    await writeFile(`${output}/smoke-${viewpoint}.png`, png);
    reports.push(result.structuredContent);
  }
  assert.deepEqual((await call("scene_summary")).structuredContent, before);
  assert.deepEqual((await call("list_objects")).structuredContent, objects);
  const target = objects.value.find((object) => object.visible && object.booleanModifiers.length);
  if (target)
    reports.push((await call("get_geometry_diagnostics", { id: target.id })).structuredContent);
  await writeFile(`${output}/smoke-report.json`, JSON.stringify(reports, null, 2));
  console.log(
    "PASS: official stdio MCP, three PNG angles, exact MIME/pixels/bytes, unchanged revision/objects, structured metadata without image duplication; diagnostics retained when applicable.",
  );
} finally {
  await client.close();
}
