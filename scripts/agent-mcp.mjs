import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { capabilityRegistry, commandTools, hasImage, tools } from "./agent-schemas.mjs";
import { readSession } from "./agent-session.mjs";

const sessionPath = process.argv[2];
const profile = process.env.CENTRA_AGENT_PROFILE === "1";
let lastSession;
const { version: buildVersion } = JSON.parse(
  await readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
);
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
const server = new McpServer({ name: "centra-sculpt-local", version: buildVersion });
for (const [name, tool] of Object.entries(tools)) {
  server.registerTool(
    name,
    { description: tool.description, inputSchema: tool.schema },
    async (args, extra) => {
      const started = profile ? performance.now() : 0;
      let responseHeaders = started;
      let result;
      try {
        const response = await post(
          "/call",
          { name, args },
          AbortSignal.any([extra.signal, AbortSignal.timeout(15000)]),
        );
        if (profile) responseHeaders = performance.now();
        if (hasImage(name)) {
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
        if (name === "get_capabilities" && result.ok) {
          const session = await readSession(sessionPath);
          Object.assign(result.value, {
            tools: Object.keys(tools),
            batchCommandTypes: Object.values(commandTools),
            featureAvailability: capabilityRegistry,
            adapter: {
              name: "centra-sculpt-local",
              version: buildVersion,
              buildVersion: session.buildVersion ?? buildVersion,
              sessionId: session.sessionId ?? "unknown",
              reconnect:
                "After a server restart, reconnect/restart this MCP process and approve the new session in the active editor. Refresh the MCP tool list if schema changes are absent.",
            },
          });
        }
      } catch {
        result = {
          ok: false,
          error: {
            code: "disconnected",
            message:
              "Local bridge unavailable or request interrupted. Start/restart dev:agent, refresh or reconnect this MCP server, then approve the current session in the active editor. If apply_changes used a transactionId, call get_transaction with that ID. Otherwise inspect the scene before retrying: a response may have been lost after the editor committed the transaction.",
          },
        };
      }
      const image = result.image;
      delete result.image;
      const serializing = profile ? performance.now() : 0;
      const text = JSON.stringify(result);
      if (profile) {
        console.error(
          `[centra-agent-profile] ${JSON.stringify({
            name,
            bridgeMs: responseHeaders - started,
            parseMs: serializing - responseHeaders,
            textSerializationMs: performance.now() - serializing,
            textBytes: Buffer.byteLength(text),
          })}`,
        );
      }
      return {
        content: [
          { type: "text", text },
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
