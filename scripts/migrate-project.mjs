import { link, lstat, mkdtemp, readFile, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import "./compile-core.mjs";
import {
  MAX_PROJECT_BYTES,
  openSculptProject,
  PROJECT_VERSION,
} from "../work/test-build/project.mjs";
import { verifyCanonicalProject } from "../work/test-build/project-migration.mjs";

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg || process.argv.length !== 4)
  throw new Error("Usage: node scripts/migrate-project.mjs original.form converted.form");

const source = resolve(sourceArg);
const output = resolve(outputArg);
const backup = `${source}.bak`;
if (source === output || backup === output || !output.toLowerCase().endsWith(".form"))
  throw new Error("Choose a separate .form output path.");
const info = await stat(source);
if (!info.isFile() || info.size > MAX_PROJECT_BYTES)
  throw new Error("Invalid project file or file size exceeds the supported limit.");
const original = await readFile(source);
const bytes = (buffer) => Uint8Array.from(buffer).buffer;
const originalData = bytes(original);
const project = openSculptProject(originalData);
const version = new DataView(originalData).getUint32(8, true);
if (version === PROJECT_VERSION) throw new Error("The input is already a canonical v24 project.");

async function publish(target, content) {
  const staging = await mkdtemp(join(dirname(target), ".centra-migration-"));
  const temporary = join(staging, basename(target));
  try {
    await writeFile(temporary, content, { flag: "wx", flush: true });
    if (!(await readFile(temporary)).equals(content))
      throw new Error("The staged file differs from the verified bytes.");
    await link(temporary, target);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await rmdir(staging);
  }
}

try {
  await publish(backup, original);
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
const backupInfo = await lstat(backup);
if (
  !backupInfo.isFile() ||
  (backupInfo.dev === info.dev && backupInfo.ino === info.ino) ||
  !(await readFile(backup)).equals(original)
)
  throw new Error(
    "The backup is not an independent byte-for-byte copy. Existing files were preserved.",
  );

const converted = Buffer.from(verifyCanonicalProject(project));
await publish(output, converted);
console.log(`Converted v${version} to v${PROJECT_VERSION}: ${output}\nVerified backup: ${backup}`);
