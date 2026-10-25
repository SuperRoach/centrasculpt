import { defineConfig } from 'vite';

// Benchmarks, tests and generated reports must not reload an unsaved browser sculpture.
export default defineConfig({
  server: { strictPort: true, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.certs/**', '**/*-key.*'] }, host: '0.0.0.0', port: 5173, allowedHosts: ['bretts-macbook-pro.local'], watch: { ignored: ['**/work/**', '**/outputs/**', '**/tests/**', '**/scripts/**', '**/.certs/**'] } },
});
