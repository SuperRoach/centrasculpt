import { request } from "node:http";
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
      bridge = await startAgentBridge({ origin });
      unpublish = await publishSession(bridge.sessionFile);
      console.info(
        `\nAgent session: ${bridge.sessionFile}\nOpen ${editorOrigin} or the LAN IP shown by Vite and approve Local agent access. The editor uses its existing port for browser agent access.\n`,
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
      function isEditorRequest(req) {
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
        const editorPort = req.socket.localPort;
        return (
          requestHost?.port === String(editorPort) &&
          lanHostnames.includes(requestHost?.hostname) &&
          (!req.headers.origin ||
            (requestOrigin?.origin === requestHost.origin &&
              req.headers.origin === requestOrigin.origin)) &&
          (!req.headers["sec-fetch-site"] || req.headers["sec-fetch-site"] === "same-origin")
        );
      }
      server.middlewares.use("/__centra_agent_session", (req, res) => {
        if (
          req.method !== "GET" ||
          !isEditorRequest(req) ||
          req.headers["x-centra-agent-discovery"] !== "1"
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            token: bridge.browserToken,
          }),
        );
      });
      const browserRoutes = new Set(["/approve", "/poll", "/result", "/revoke", "/preview-image"]);
      server.middlewares.use("/__centra_agent", (req, res) => {
        const path = req.url.split("?", 1)[0];
        if (
          req.method !== "POST" ||
          !isEditorRequest(req) ||
          !browserRoutes.has(path) ||
          req.headers.authorization !== `Bearer ${bridge.browserToken}`
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        const upstream = request(
          new URL(bridge.url),
          {
            path: req.url,
            method: "POST",
            headers: {
              Origin: origin,
              Authorization: req.headers.authorization,
              "Content-Type": req.headers["content-type"] ?? "application/json",
            },
          },
          (response) => {
            res.writeHead(response.statusCode, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            });
            response.on("error", () => res.destroy());
            response.pipe(res);
          },
        );
        upstream.on("error", () => {
          if (res.headersSent) return res.destroy();
          res.writeHead(502, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ error: { message: "Agent bridge is unavailable." } }));
        });
        res.on("close", () => upstream.destroy());
        req.pipe(upstream);
      });
      const current = bridge;
      server.httpServer.once("close", () => {
        void current.close();
        void unpublish?.();
      });
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
