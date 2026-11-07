import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWrite, validateCall } from "./agent-schemas.mjs";

export async function startAgentBridge({
  origin = "http://127.0.0.1:5173",
  port = 0,
  timeout = 12000,
} = {}) {
  const token = randomBytes(32).toString("hex"),
    browserToken = randomBytes(32).toString("hex");
  let approved = false,
    editing = false,
    owner = null,
    pending = null,
    heartbeat = 0;
  const fail = (message) => ({ ok: false, error: { code: "agent_access", message } });
  function revoke(message = "Access revoked; approve a new connection in the editor.") {
    approved = editing = false;
    owner = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve(fail(message));
      pending = null;
    }
  }
  const server = createServer(async (req, res) => {
    const send = (code, value) => {
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(value));
    };
    try {
      if (
        req.headers.host !== `127.0.0.1:${server.address().port}` ||
        req.headers.origin !== origin
      )
        return send(403, fail("Wrong host or origin."));
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
        res.setHeader("Access-Control-Allow-Methods", "POST");
        return send(200, {});
      }
      if (req.method !== "POST") return send(405, fail("Use POST."));
      const browser = req.headers.authorization === `Bearer ${browserToken}`;
      if (!browser && req.headers.authorization !== `Bearer ${token}`)
        return send(401, fail("Invalid temporary credentials."));
      if (req.url.startsWith("/preview-image?")) {
        const query = new URL(req.url, "http://127.0.0.1").searchParams;
        if (
          !browser ||
          !approved ||
          owner !== query.get("client") ||
          !pending ||
          pending.job.name !== "capture_scene_preview" ||
          pending.job.id !== query.get("id") ||
          pending.image ||
          pending.uploading ||
          Date.now() >= pending.job.deadline ||
          req.headers["content-type"] !== "image/png"
        )
          return send(403, fail("Preview upload is not authorised for this request."));
        const request = pending;
        request.uploading = true;
        try {
          const chunks = [];
          let bytes = 0;
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > 524288) return send(413, fail("Preview exceeds 512 KiB."));
            chunks.push(chunk);
          }
          const png = Buffer.concat(chunks);
          if (pending !== request || !approved || Date.now() >= request.job.deadline)
            return send(409, fail("Preview expired."));
          if (
            png.length < 33 ||
            !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
            png.toString("ascii", 12, 16) !== "IHDR" ||
            png.readUInt32BE(16) !== request.job.args.width ||
            png.readUInt32BE(20) !== request.job.args.height
          )
            return send(400, fail("Invalid PNG or dimensions."));
          request.image = { data: png.toString("base64"), mimeType: "image/png", bytes };
          return send(200, {});
        } finally {
          request.uploading = false;
        }
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) return send(413, fail("Request exceeds 64 KiB."));
      }
      const data = JSON.parse(body);
      if (browser) {
        if (typeof data.client !== "string" || data.client.length > 128)
          return send(400, fail("Browser client required."));
        if (req.url === "/approve") {
          if (owner && owner !== data.client)
            return send(409, fail("Another editor is connected. Revoke it first."));
          owner = data.client;
          approved = true;
          editing = data.editing === true;
          heartbeat = Date.now();
          if (!editing && pending && isWrite(pending.job.name))
            revoke("Editing permission revoked.");
          return send(200, { approved, editing });
        }
        if (owner !== data.client) return send(403, fail("This editor has not been approved."));
        heartbeat = Date.now();
        if (req.url === "/revoke") {
          revoke();
          return send(200, {});
        }
        if (req.url === "/poll") {
          const job = pending && !pending.delivered ? pending.job : null;
          if (pending) pending.delivered = true;
          return send(200, { approved, editing, job });
        }
        if (req.url === "/result" && pending && pending.job.id === data.id) {
          clearTimeout(pending.timer);
          if (pending.job.name === "capture_scene_preview" && data.result?.ok) {
            const image = pending.image;
            if (
              !image ||
              data.result.value?.bytes !== image.bytes ||
              data.result.value?.mimeType !== image.mimeType ||
              data.result.value?.width !== pending.job.args.width ||
              data.result.value?.height !== pending.job.args.height
            )
              data.result = fail("Missing preview image or inconsistent metadata.");
            else data.result.image = { data: image.data, mimeType: image.mimeType };
          }
          pending.resolve(data.result);
          pending = null;
          return send(200, {});
        }
        return send(409, fail("Request expired or unsupported."));
      }
      if (req.url === "/disconnect") {
        revoke("MCP process disconnected.");
        return send(200, {});
      }
      if (req.url !== "/call") return send(404, fail("Unknown endpoint."));
      const call = validateCall(data);
      if (!approved || Date.now() - heartbeat > 2500)
        return send(403, fail("Approve connection in the active editor first."));
      if (isWrite(call.name) && !editing)
        return send(403, fail("Read-only connection. Enable editing in the browser."));
      if (pending) return send(409, fail("busy: another agent operation is active."));
      const result = await new Promise((resolve) => {
        pending = {
          resolve,
          delivered: false,
          job: { ...call, id: randomUUID(), deadline: Date.now() + timeout - 2000 },
          timer: setTimeout(
            () => revoke("Operation timed out; access revoked. Query again after reconnecting."),
            timeout,
          ),
        };
        res.on("close", () => {
          if (!res.writableEnded && pending?.resolve === resolve)
            revoke("Agent disconnected during request.");
        });
      });
      return send(200, result);
    } catch (error) {
      if (!res.headersSent) send(400, fail(`Malformed request: ${error.message}`));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const directory = await mkdtemp(join(tmpdir(), "centra-agent-"));
  const sessionFile = join(directory, "session.json");
  await writeFile(sessionFile, JSON.stringify({ url, token, origin }), { mode: 0o600 });
  const watchdog = setInterval(() => {
    if (approved && Date.now() - heartbeat > 2500) revoke("Editor disconnected.");
  }, 500);
  let closing;
  return {
    url,
    token,
    browserToken,
    sessionFile,
    close() {
      closing ??= (async () => {
        clearInterval(watchdog);
        revoke("Development bridge stopped.");
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        await rm(directory, { recursive: true, force: true });
      })();
      return closing;
    },
  };
}
