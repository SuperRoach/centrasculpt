import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
export function serve(port = 4176) {
  const root = fileURLToPath(new URL("./dist", import.meta.url));
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
  };
  const server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      if (pathname.startsWith("/nested-guide/")) pathname = pathname.slice("/nested-guide".length);
      const qaFiles = {
        "/__qa.html": "browser-qa.html",
        "/__qa.js": "browser-qa.js",
        "/__axe.js": "node_modules/axe-core/axe.min.js",
      };
      if (qaFiles[pathname]) {
        const data = await readFile(new URL(qaFiles[pathname], import.meta.url));
        res
          .writeHead(200, {
            "Content-Type": pathname.endsWith(".html") ? "text/html" : "text/javascript",
          })
          .end(data);
        return;
      }
      const file = resolve(
        root,
        "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
      );
      if (!file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const data = await readFile(file);
      res
        .writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" })
        .end(data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  server.listen(port, "127.0.0.1");
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = serve(Number(process.env.PORT || 4176));
  server.on("listening", () =>
    console.log(`Centra guide: http://127.0.0.1:${server.address().port}`),
  );
}
