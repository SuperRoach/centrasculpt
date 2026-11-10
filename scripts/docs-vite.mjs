import { spawnSync } from "node:child_process";
import { cp, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const guide = resolve(repository, "read-the-docs-pls/dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
};

/** Build from source, including search, using the root install (no nested npm install needed). */
export function buildDocs() {
  for (const args of [
    [resolve(repository, "read-the-docs-pls/build.mjs")],
    [fileURLToPath(new URL("./runner/bin.cjs", import.meta.resolve("pagefind"))), "--site", guide],
  ]) {
    const result = spawnSync(process.execPath, args, { cwd: repository, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("Documentation build failed; app build stopped.");
  }
}

/** Serve only built public files; never fall through to the editor for missing guide assets. */
export function docsMiddleware(directory, base = "/") {
  const root = resolve(directory);
  const prefix = `${base}read-the-docs`;
  return async (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return next();
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    if (url.pathname === prefix) {
      res.writeHead(302, { Location: `${prefix}/${url.search}` }).end();
      return;
    }
    try {
      const relative = decodeURIComponent(url.pathname.slice(prefix.length + 1));
      const file = resolve(root, relative || "index.html");
      if (!file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(404).end("Guide page not found");
    }
  };
}

export function docsPlugin() {
  let config;
  return {
    name: "centra-public-guide",
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      buildDocs();
      server.middlewares.use(docsMiddleware(guide, server.config.base));
    },
    async writeBundle() {
      buildDocs();
      await cp(guide, resolve(config.root, config.build.outDir, "read-the-docs"), {
        recursive: true,
      });
    },
  };
}
