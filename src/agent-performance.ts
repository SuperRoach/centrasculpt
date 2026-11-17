export type AgentPerformanceEntry = { name: string; durationMs: number; details?: unknown };

declare global {
  interface Window {
    __centraAgentProfileEnabled?: boolean;
    __centraAgentProfile?: AgentPerformanceEntry[];
  }
}

/** Opt-in development-only measurements used by the disposable MCP benchmark. */
export function recordAgentPerformance(name: string, durationMs: number, details?: unknown): void {
  if (typeof window === "undefined" || !window.__centraAgentProfileEnabled) return;
  const entries = window.__centraAgentProfile ?? [];
  window.__centraAgentProfile = entries;
  entries.push({ name, durationMs, ...(details ? { details } : {}) });
}
