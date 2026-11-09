import { startAgentBridge } from "./agent-bridge.mjs";
import { publishSession } from "./agent-session.mjs";
import { lanHostnames, machineLocalHostname } from "./hostnames.mjs";

export function agentPlugin() {
  let bridge;
  let unpublish;
  return {
    name: "centra-local-agent",
    apply: "serve",
    async configureServer(server) {
      const origin = `http://127.0.0.1:${server.config.server.port}`;
      const editorOrigin = `http://${machineLocalHostname}:${server.config.server.port}`;
      bridge = await startAgentBridge({
        origin,
        host: "0.0.0.0",
        allowedHostnames: lanHostnames,
      });
      unpublish = await publishSession(bridge.sessionFile);
      console.info(
        `\nAgent session: ${bridge.sessionFile}\nOpen ${editorOrigin} or the LAN IP shown by Vite and approve Local agent access. This editor and its temporary agent bridge are reachable on your local network.\n`,
      );
      // Vite's client still opens a reload socket with hmr:false. Agent mode
      // serves only its style helpers, preserving the unsaved editor across restarts.
      server.middlewares.use("/@vite/client", (_req, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-store");
        res.end(`
          globalThis.__AGENT_ENABLED__ = true;
          globalThis.__APP_VERSION__ = ${server.config.define.__APP_VERSION__};
          const styles = new Map();
          export function updateStyle(id, content) {
            let style = styles.get(id);
            if (!style) { style = document.createElement('style'); styles.set(id, style); document.head.appendChild(style); }
            style.textContent = content;
          }
          export function removeStyle(id) { styles.get(id)?.remove(); styles.delete(id); }
          export function createHotContext() {
            return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {} };
          }
          export function injectQuery(url, query) { return url + (url.includes('?') ? '&' : '?') + query; }
          export class ErrorOverlay extends HTMLElement {}
        `);
      });
      server.middlewares.use("/__centra_agent_session", (req, res) => {
        let requestHost;
        let requestOrigin;
        try {
          requestHost = new URL(`http://${req.headers.host}`);
        } catch {
          requestHost = null;
        }
        try {
          if (req.headers.origin) requestOrigin = new URL(req.headers.origin);
        } catch {
          requestOrigin = null;
        }
        const requestHostname = requestHost?.hostname;
        const expectedOrigin = `http://${requestHostname}:${server.config.server.port}`;
        const validHost =
          requestHost?.port === `${server.config.server.port}` &&
          lanHostnames.includes(requestHostname);
        const validOrigin =
          !req.headers.origin ||
          (requestOrigin?.origin === expectedOrigin && requestOrigin.hostname === requestHostname);
        if (
          req.method !== "GET" ||
          !validHost ||
          !validOrigin ||
          req.headers["x-centra-agent-discovery"] !== "1" ||
          (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin")
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            url: bridge.urlForHostname(requestHostname),
            token: bridge.browserToken,
          }),
        );
      });
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
