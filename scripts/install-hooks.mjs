import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

let gitRoot;
try {
  gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  // npm also runs prepare in source archives and non-Git installation contexts.
  process.exit(0);
}

if (gitRoot === root.replace(/\/$/, "")) {
  execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
    cwd: root,
    stdio: "inherit",
  });
  console.log("Git pre-commit hook enabled from .githooks.");
}
