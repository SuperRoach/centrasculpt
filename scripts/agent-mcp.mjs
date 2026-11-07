import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { commandTools, tools } from "./agent-schemas.mjs";
import { readSession } from "./agent-session.mjs";

const sessionPath = process.argv[2];
let lastSession;
const post = async (path, body, signal) => {
  const session = path === "/disconnect" ? lastSession : await readSession(sessionPath);
  if (!session) return;
  lastSession = session;
  return fetch(`${session.url}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
      Origin: session.origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
};
const server = new McpServer({ name: "centra-sculpt-local", version: "0.1.0" });
for (const [name, tool] of Object.entries(tools)) {
  server.registerTool(
    name,
    { description: tool.description, inputSchema: tool.schema },
    async (args, extra) => {
      let result;
      try {
        const response = await post(
          "/call",
          { name, args },
          AbortSignal.any([extra.signal, AbortSignal.timeout(15000)]),
        );
        if (name === "capture_scene_preview") {
          const reader = response.body.getReader();
          const chunks = [];
          let bytes = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              bytes += value.byteLength;
              if (bytes > 786432) {
                await reader.cancel();
                throw new Error("Preview response exceeds 768 KiB.");
              }
              chunks.push(Buffer.from(value));
            }
            result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } finally {
            reader.releaseLock();
          }
        } else result = await response.json();
        if (name === "get_capabilities" && result.ok)
          Object.assign(result.value, {
            tools: Object.keys(tools),
            batchCommandTypes: Object.values(commandTools),
            featureAvailability: {
              ellipsoids: true,
              taperedCylinders: true,
              cones: "canonical cylinder preset with zero topDiameter",
              capsules: true,
              tori: true,
              pyramids: true,
              primitiveDimensionScaling: true,
              booleans: true,
              arrays: true,
              hierarchy: true,
              printableParts: true,
              enclosures: true,
              evaluatedDiagnostics: true,
              scenePreview: {
                scope: "whole-visible-model",
                pixels: 262144,
                maxEdge: 512,
                maxPngBytes: 524288,
                requiresReadyDisplay: true,
              },
            },
          });
      } catch (error) {
        result = {
          ok: false,
          error: {
            code: "disconnected",
            message: `Local bridge unavailable: ${error.message}. Start dev:agent and approve the connection.`,
          },
        };
      }
      const image = result.image;
      delete result.image;
      return {
        content: [
          { type: "text", text: JSON.stringify(result) },
          ...(result.ok && image ? [{ type: "image", ...image }] : []),
        ],
        structuredContent: result,
        isError: !result.ok,
      };
    },
  );
}
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    await post("/disconnect", {}, AbortSignal.timeout(1000));
  } catch {}
  await server.close();
}
process.once("SIGINT", () => {
  void close().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void close().finally(() => process.exit(0));
});
process.stdin.once("end", () => {
  void close();
});
await server.connect(new StdioServerTransport());
