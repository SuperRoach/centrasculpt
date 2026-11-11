import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

const directory = resolve("work/compact-sculpt");
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/browser.mjs", ["browser.mjs", "text/javascript; charset=utf-8"]],
]);
const port = 4179;
createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/results") {
    let body = "";
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 1024 * 1024) throw new Error("Result is too large");
      }
      const result = JSON.parse(body);
      if (result.runs?.length !== 2) throw new Error("Expected two benchmark runs");
      const name = `${new Date().toISOString().replaceAll(":", "-")}-browser.json`;
      writeFileSync(resolve(directory, name), JSON.stringify(result, null, 2), { flag: "wx" });
      console.log(name);
      res.end(name);
    } catch (error) {
      res.writeHead(400).end(error.message);
    }
    return;
  }
  const file = files.get(req.url);
  if (req.method !== "GET" || !file) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": file[1], "Cache-Control": "no-store" });
  res.end(readFileSync(resolve(directory, file[0])));
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));
