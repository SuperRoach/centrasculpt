import "./agent-access.css";
import credentials from "virtual:centra-agent";
import { type AgentJob, agentExecutor } from "./agent-access";
import type { IndependentLayers } from "./independent-layers";

export function mountAgentAccess(
  editor: () => IndependentLayers,
  blocked: () => boolean,
  changed: () => void,
) {
  const panel = document.createElement("aside");
  panel.className = "agent-access";
  panel.setAttribute("aria-label", "Local agent access (development)");
  panel.innerHTML = `
    <div class="agent-access-heading"><span class="agent-access-icon" aria-hidden="true">↗</span>
      <div><h2>Local agent access</h2><span class="agent-access-eyebrow">DEVELOPMENT SESSION</span></div>
    </div>
    <p class="agent-access-status" role="status" aria-live="polite"></p>
    <button class="agent-access-dismiss" type="button" aria-label="Dismiss agent access">×</button>
    <button class="agent-access-connect" type="button">Approve connection</button>
    <label class="agent-access-permission">
      <span><strong>Allow editing (includes Undo)</strong><small>Create and change objects in this scene.</small></span>
      <input type="checkbox" disabled><span class="agent-access-switch" aria-hidden="true"></span>
    </label>
    <p class="agent-access-help"></p>
    <button class="agent-access-revoke" type="button" hidden>Revoke access</button>`;
  const status = panel.querySelector<HTMLParagraphElement>(".agent-access-status")!;
  const help = panel.querySelector<HTMLParagraphElement>(".agent-access-help")!;
  const connect = panel.querySelector<HTMLButtonElement>(".agent-access-connect")!;
  const edit = panel.querySelector<HTMLInputElement>("input")!;
  // Keep the accessible name concise; supporting copy is a description.
  edit.setAttribute("aria-label", "Allow editing (includes Undo)");
  const revoke = panel.querySelector<HTMLButtonElement>(".agent-access-revoke")!;
  const launcher = document.createElement("button");
  launcher.className = "agent-access-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open local agent access");
  launcher.textContent = "↗";
  launcher.hidden = true;
  panel.querySelector<HTMLButtonElement>(".agent-access-dismiss")?.addEventListener("click", () => {
    panel.hidden = true;
    launcher.hidden = false;
    launcher.focus();
  });
  launcher.onclick = () => {
    panel.hidden = false;
    launcher.hidden = true;
    panel.querySelector<HTMLButtonElement>(".agent-access-dismiss")?.focus();
  };
  document.body.append(panel, launcher);
  const setStatus = (message: string) => {
    status.textContent = message;
    status.title = message;
    launcher.title = `Local agent access · ${message}`;
    launcher.dataset.state = message.startsWith("Connected")
      ? edit.checked
        ? "editing"
        : "connected"
      : "disconnected";
  };
  let approved = false,
    running: AbortController | undefined;
  const client = crypto.randomUUID();
  const execute = agentExecutor(editor, () => approved && edit.checked, blocked, changed);
  const post = async (path: string, data: object = {}) => {
    const response = await fetch(`${credentials.url}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, client }),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error?.message ?? `Bridge HTTP ${response.status}`);
    }
    return response.json();
  };
  const reset = (message: string) => {
    approved = false;
    edit.checked = false;
    edit.disabled = true;
    running?.abort();
    setStatus(message);
    connect.disabled = false;
    connect.hidden = false;
    revoke.hidden = true;
    panel.dataset.state = "disconnected";
    help.textContent = "Starts read-only. You can revoke access at any time.";
  };
  reset("Not connected");
  connect.onclick = async () => {
    connect.disabled = true;
    setStatus("Connecting…");
    try {
      await post("/approve", { editing: false });
      approved = true;
      edit.disabled = false;
      connect.disabled = true;
      connect.hidden = true;
      revoke.hidden = false;
      panel.dataset.state = "connected";
      help.textContent = "Agents can inspect your scene. Editing is off.";
      setStatus("Connected · read-only");
    } catch (error) {
      reset("Connection needs attention");
      panel.dataset.state = "error";
      help.textContent =
        location.hostname !== "127.0.0.1"
          ? `Open http://127.0.0.1:${location.port} to approve this local session.`
          : error instanceof Error && error.message !== "Failed to fetch"
            ? error.message
            : "Cannot reach the local bridge. Restart dev:agent, then reload this editor.";
    }
  };
  edit.onchange = async () => {
    running?.abort();
    try {
      const state = await post("/approve", { editing: edit.checked });
      if (!state.approved) throw new Error("Approval revoked");
      setStatus(edit.checked ? "Connected · editing allowed" : "Connected · read-only");
      panel.dataset.state = edit.checked ? "editing" : "connected";
      help.textContent = edit.checked
        ? "Agent edits join your Undo history. Manual files stay under your control."
        : "Agents can inspect your scene. Editing is off.";
    } catch {
      reset("Permission changed; reconnect to continue.");
    }
  };
  revoke.onclick = () => {
    reset("Access revoked. Ordinary editing remains available.");
    void post("/revoke").catch(() => {});
  };
  let polling = false;
  const timer = setInterval(async () => {
    if (!approved || polling) return;
    polling = true;
    try {
      const state = await post("/poll");
      if (!state.approved) {
        reset("Agent disconnected; approval required again.");
        return;
      }
      if (state.job && !running) {
        const job = state.job as AgentJob;
        const controller = new AbortController();
        running = controller;
        const deadline = setTimeout(
          () => controller.abort(),
          Math.max(0, job.deadline - Date.now()),
        );
        void execute(job, controller.signal)
          .catch((error: Error) => ({
            ok: false,
            error: { code: "operation_failed", message: error.message },
          }))
          .then((result) => post("/result", { id: job.id, result }))
          .catch(() => reset("Bridge disconnected; inspect the scene before retrying."))
          .finally(() => {
            clearTimeout(deadline);
            running = undefined;
          });
      }
    } catch {
      reset("Bridge disconnected; ordinary editing remains available.");
    } finally {
      polling = false;
    }
  }, 250);
  window.addEventListener(
    "pagehide",
    () => {
      clearInterval(timer);
      reset("Disconnected");
      void post("/revoke").catch(() => {});
    },
    { once: true },
  );
}
