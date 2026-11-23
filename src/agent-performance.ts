export type AgentPerformanceEntry = { name: string; durationMs: number; details?: unknown };

declare global {
  interface Window {
    __centraAgentProfileEnabled?: boolean;
    __centraAgentProfileReferenceMeshScheduling?: boolean;
    __centraAgentProfile?: AgentPerformanceEntry[];
  }
}

export function agentPerformanceEnabled(): boolean {
  return typeof window !== "undefined" && window.__centraAgentProfileEnabled === true;
}

/** Opt-in development-only measurements used by the disposable MCP benchmark. */
export function recordAgentPerformance(name: string, durationMs: number, details?: unknown): void {
  if (!agentPerformanceEnabled()) return;
  const entries = window.__centraAgentProfile ?? [];
  window.__centraAgentProfile = entries;
  entries.push({ name, durationMs, ...(details ? { details } : {}) });
}
