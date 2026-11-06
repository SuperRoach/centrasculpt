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
        result = await response.json();
        if (name === "get_capabilities" && result.ok)
          Object.assign(result.value, {
            tools: Object.keys(tools),
            batchCommandTypes: Object.values(commandTools),
            featureAvailability: {
              booleans: true,
              arrays: true,
              hierarchy: true,
              printableParts: true,
              enclosures: true,
              evaluatedDiagnostics: true,
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
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
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
