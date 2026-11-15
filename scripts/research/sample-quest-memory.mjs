import { execFile } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const [path = "work/paced-renderer/quest-os-memory.jsonl", seconds = "180", serial] =
  process.argv.slice(2);
const duration = Number(seconds);
if (!Number.isFinite(duration) || duration < 1 || duration > 600)
  throw new Error("Choose a duration from 1 to 600 seconds");
const run = promisify(execFile);
const target = serial ? ["-s", serial] : [];
async function adb(args) {
  try {
    const result = await run("adb", [...target, ...args], { timeout: 3500, maxBuffer: 256 * 1024 });
    return { output: result.stdout.trim() };
  } catch (error) {
    return { error: String(error.stderr || error.message).trim() };
  }
}
const browser = /^\s*(\d+)\s+(com\.oculus\.browser(?::\S*)?)\s*$/;
function pssKiB(output) {
  const labeled = output?.match(/TOTAL PSS:\s+([\d,]+)/);
  const row = output?.match(/^\s*TOTAL\s+([\d,]+)\s/m);
  const value = labeled?.[1] ?? row?.[1];
  return value ? Number(value.replaceAll(",", "")) : null;
}

const state = await adb(["get-state"]);
if (state.output !== "device") throw new Error(state.error ?? "Quest ADB device unavailable");
writeFileSync(path, "", { flag: "wx" });
const start = Date.now();
while (Date.now() - start < duration * 1000) {
  const hostEpochMs = Date.now();
  const listing = await adb(["shell", "ps", "-A", "-o", "PID,NAME"]);
  const processes = [];
  for (const line of (listing.output ?? "").split("\n")) {
    const match = line.match(browser);
    if (match) processes.push({ pid: match[1], name: match[2] });
  }
  const sample = [];
  for (const process of processes) {
    const mem = await adb(["shell", "dumpsys", "meminfo", "-s", process.pid]);
    const gpu = await adb(["shell", "gpumeminfo", "-m", "-o", "-p", process.pid]);
    sample.push({ ...process, pssKiB: pssKiB(mem.output), memError: mem.error, gpu });
  }
  appendFileSync(
    path,
    `${JSON.stringify({
      hostEpochMs,
      endEpochMs: Date.now(),
      processes: sample,
      listError: listing.error,
      summedBrowserPssKiB:
        sample.length && sample.every((p) => p.pssKiB !== null)
          ? sample.reduce((n, p) => n + p.pssKiB, 0)
          : null,
    })}\n`,
  );
  if (Date.now() - start < duration * 1000) await delay(1000);
}
console.log(path);
