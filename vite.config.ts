import { defineConfig } from "vite";
import { version } from "./package.json";

// Benchmarks, tests and generated reports must not reload an unsaved browser sculpture.
export default defineConfig(async ({ command }) => {
  const agent = command === "serve" && process.env.CENTRA_AGENT === "1";
  return {
    plugins: agent ? [(await import("./scripts/agent-vite.mjs")).agentPlugin()] : [],
    define: { __APP_VERSION__: JSON.stringify(version), __AGENT_ENABLED__: agent },
    server: {
      strictPort: true,
      fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.certs/**", "**/*-key.*"] },
      host: agent ? "127.0.0.1" : "0.0.0.0",
      port: 5173,
      allowedHosts: ["bretts-macbook-pro.local"],
      watch: {
        ignored: ["**/work/**", "**/outputs/**", "**/tests/**", "**/scripts/**", "**/.certs/**"],
      },
    },
  };
});
