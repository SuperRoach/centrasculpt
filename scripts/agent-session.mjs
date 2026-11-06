import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Stable discovery contains only a pointer; authentication stays temporary.
export const discoveryFile =
  process.env.CENTRA_AGENT_DISCOVERY_FILE ??
  fileURLToPath(new URL("../work/agent-session.json", import.meta.url));
export async function publishSession(sessionFile, destination = discoveryFile) {
  await mkdir(fileURLToPath(new URL("../work/", import.meta.url)), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ sessionFile }), { mode: 0o600 });
  await rename(temporary, destination);
  return async () => {
    try {
      if (JSON.parse(await readFile(destination, "utf8")).sessionFile === sessionFile)
        await rm(destination, { force: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  };
}
export async function readSession(explicitPath, discovery = discoveryFile) {
  const path = explicitPath ?? JSON.parse(await readFile(discovery, "utf8")).sessionFile;
  const session = JSON.parse(await readFile(path, "utf8"));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(session.url) || typeof session.token !== "string")
    throw new Error("Invalid local agent session; start dev:agent again.");
  return session;
}
