import { defineConfig } from "vite";
import { version } from "./package.json";
import { docsPlugin } from "./scripts/docs-vite.mjs";
import { lanHostnames } from "./scripts/hostnames.mjs";

// Benchmarks, tests and generated reports must not reload an unsaved browser sculpture.
export default defineConfig(async ({ command }) => {
  const agent = command === "serve" && process.env.CENTRA_AGENT === "1";
  return {
    plugins: [
      docsPlugin(),
      ...(agent ? [(await import("./scripts/agent-vite.mjs")).agentPlugin()] : []),
    ],
    define: { __APP_VERSION__: JSON.stringify(version), __AGENT_ENABLED__: agent },
    // All clients already use module workers; permit lazy optional reduction chunks.
    worker: { format: "es" },
    server: {
      strictPort: true,
      // Agent sessions preserve in-memory sculptures across server restarts.
      hmr: agent ? false : undefined,
      fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.certs/**", "**/*-key.*"] },
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: [...new Set(["bretts-macbook-pro.local", ...lanHostnames])],
      watch: {
        ignored: [
          "**/work/**",
          "**/outputs/**",
          "**/tests/**",
          "**/scripts/**",
          "**/.certs/**",
          "**/read-the-docs-pls/dist/**",
        ],
      },
    },
  };
});
