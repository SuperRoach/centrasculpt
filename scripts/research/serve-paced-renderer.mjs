import { appendFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

const html = readFileSync(resolve(process.argv[2] ?? "work/paced-renderer/headset.html"));
const profileLog = process.argv[3] && resolve(process.argv[3]);
const port = Number(process.argv[4] ?? 4182);
let records = 0;
createServer(async (request, response) => {
  if (profileLog && request.method === "POST" && request.url === "/profile") {
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 8192) throw new Error("Oversized profile checkpoint");
      }
      const point = JSON.parse(body);
      if (
        !point ||
        typeof point.runId !== "string" ||
        typeof point.phase !== "string" ||
        records >= 128
      )
        throw new Error("Invalid profile checkpoint or run budget exhausted");
      appendFileSync(profileLog, `${JSON.stringify({ hostEpochMs: Date.now(), ...point })}\n`);
      records++;
      return response.writeHead(204).end();
    } catch (error) {
      return response.writeHead(400).end(error.message);
    }
  }
  if (request.method !== "GET" || request.url !== "/") return response.writeHead(404).end();
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}).listen(port, "127.0.0.1", () => console.log(`Listening on 127.0.0.1:${port}`));
