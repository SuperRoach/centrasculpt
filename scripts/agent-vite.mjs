import { startAgentBridge } from "./agent-bridge.mjs";
import { publishSession } from "./agent-session.mjs";

export function agentPlugin() {
  let bridge;
  let unpublish;
  return {
    name: "centra-local-agent",
    apply: "serve",
    async configureServer(server) {
      const origin = `http://127.0.0.1:${server.config.server.port}`;
      bridge = await startAgentBridge({ origin });
      unpublish = await publishSession(bridge.sessionFile);
      console.info(
        `\nAgent session: ${bridge.sessionFile}\nOpen ${origin} and approve Local agent access.\n`,
      );
      const current = bridge;
      server.httpServer.once("close", () => {
        void current.close();
        void unpublish?.();
      });
    },
    resolveId(id) {
      if (id === "virtual:centra-agent") return "\0centra-agent";
    },
    load(id) {
      if (id === "\0centra-agent")
        return `export default ${JSON.stringify({ url: bridge.url, token: bridge.browserToken })}`;
    },
    async closeBundle() {
      if (bridge) {
        await bridge.close();
        await unpublish?.();
        bridge = undefined;
      }
    },
  };
}
