import { defineConfig } from "vite";
import { version } from "./package.json";

// Benchmarks, tests and generated reports must not reload an unsaved browser sculpture.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    strictPort: true,
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.certs/**", "**/*-key.*"] },
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["bretts-macbook-pro.local"],
    watch: {
      ignored: ["**/work/**", "**/outputs/**", "**/tests/**", "**/scripts/**", "**/.certs/**"],
    },
  },
});
