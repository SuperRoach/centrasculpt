import "./agent-access.css";
import credentials from "virtual:centra-agent";
import { type AgentJob, AgentProposals, agentExecutor } from "./agent-access";
import type { IndependentLayers } from "./independent-layers";
import { ModellingAPI } from "./modelling-api";

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
  launcher.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z"/></svg>`;
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "local-agent-panel");
  panel.id = "local-agent-panel";
  panel.hidden = true;
  panel.querySelector<HTMLButtonElement>(".agent-access-dismiss")?.addEventListener("click", () => {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  });
  launcher.onclick = () => {
    panel.hidden = !panel.hidden;
    launcher.setAttribute("aria-expanded", String(!panel.hidden));
    panel.querySelector<HTMLButtonElement>(".agent-access-dismiss")?.focus();
  };
  document.body.append(panel, launcher);
  let activityLabel = "";
  let connectionLabel = "Connect";
  const refreshLauncher = () => {
    launcher.title = `Local agent access · ${activityLabel || connectionLabel}`;
    launcher.dataset.activity =
      activityLabel === "Review plan" || activityLabel === "Needs review" ? "review" : "idle";
  };
  const setStatus = (message: string) => {
    connectionLabel = message.startsWith("Connected") ? "Connected" : "Connect";
    refreshLauncher();
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
  const proposalPanel = document.createElement("section");
  proposalPanel.className = "agent-proposal";
  proposalPanel.setAttribute("aria-label", "Agent proposal");
  const activity = document.createElement("p");
  activity.setAttribute("role", "status");
  const explanation = document.createElement("p");
  explanation.className = "agent-proposal-explanation";
  const summary = document.createElement("div");
  summary.className = "agent-proposal-diff";
  const operations = document.createElement("ol");
  const raw = document.createElement("details");
  const rawLabel = document.createElement("summary");
  rawLabel.textContent = "Inspect exact commands and source report";
  const details = document.createElement("pre");
  raw.append(rawLabel, details);
  const approvePlan = document.createElement("button");
  approvePlan.textContent = "Approve this exact plan";
  const rejectPlan = document.createElement("button");
  rejectPlan.textContent = "Reject proposal";
  proposalPanel.append(activity, explanation, summary, operations, raw, approvePlan, rejectPlan);
  panel.append(proposalPanel);
  const proposals = new AgentProposals(() => {
    const p = proposals.current;
    proposalPanel.hidden = !p;
    activity.textContent = p ? `${p.title} · ${p.state}` : "";
    activityLabel = p
      ? {
          "preview computing": "Previewing…",
          "awaiting approval": "Review plan",
          approved: "Plan approved",
          applying: "Applying…",
          applied: "Applied",
          "rejected/error": "Needs review",
        }[p.state]
      : "";
    refreshLauncher();
    launcher.title = activity.textContent || "Local agent access";
    explanation.textContent = p
      ? `${p.description} Approval expires at ${new Date(p.expiresAt).toLocaleTimeString()}. Source preview only; array/Boolean bounds are not evaluated. Final topology and physical fit unknown. To edit: reject and submit a revised proposal for a new preview and approval.`
      : "";
    summary.replaceChildren();
    operations.replaceChildren();
    if (p) {
      if (p.recipe) {
        const item = document.createElement("li");
        item.textContent = `${p.recipe.type} enclosure · ${p.recipe.parameters.name} · standalone recipe transaction`;
        operations.append(item);
      }
      for (const step of p.steps) {
        const item = document.createElement("li");
        const command = step.command;
        const target = "id" in command ? ` ${command.id}` : "";
        const operation = "operation" in command ? ` · ${command.operation}` : "";
        const source = "sourceId" in command ? ` ${command.sourceId}` : "";
        const count =
          "definition" in command
            ? ` · ${command.definition.kind}, ${command.definition.count} instances`
            : "";
        item.textContent = `${command.type.replaceAll(".", " ")}${target}${operation}${source}${count}${step.as ? ` → $${step.as}` : ""}`;
        operations.append(item);
      }
      const report = p.preview?.value;
      if (report)
        for (const kind of ["created", "modified", "deleted"] as const) {
          const line = document.createElement("p");
          line.dataset.change = kind;
          const label = { created: "＋ Add", modified: "~ Edit", deleted: "− Delete" }[kind];
          line.textContent = `${label}: ${report.changes[kind].length}`;
          summary.append(line);
          for (const id of report.changes[kind]) {
            const object =
              report.objects.find((o) => o.id === id) ?? p.before.find((o) => o.id === id);
            const row = document.createElement("p");
            row.textContent = `${object?.name ?? id} · ${id}${object ? ` · ${object.dimensionsMM?.join(" × ") ?? "unknown"} mm` : ""}`;
            summary.append(row);
          }
        }
    }
    details.textContent = p
      ? `${p.description}\nExpires: ${new Date(p.expiresAt).toLocaleTimeString()}\nSource-cache preview only; bounds conservative. Final CSG topology and physical fit unknown. IDs provisional.\n${JSON.stringify({ operations: p.steps, recipe: p.recipe, preview: p.preview, result: p.result }, null, 2)}`
      : "";
    approvePlan.disabled = !p || p.state !== "awaiting approval" || !edit.checked;
    rejectPlan.disabled = !p || p.state === "applied";
  });
  proposalPanel.hidden = true;
  approvePlan.onclick = () => {
    if (!approved || !edit.checked || blocked()) return;
    proposals.approve(editor(), new ModellingAPI(editor(), () => false).revision);
  };
  rejectPlan.onclick = () => proposals.invalidate();
  const execute = agentExecutor(
    editor,
    () => approved && edit.checked,
    blocked,
    changed,
    proposals,
  );
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
    proposals.invalidate();
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
    proposals.invalidate();
    running?.abort();
    try {
      const state = await post("/approve", { editing: edit.checked });
      if (!state.approved) throw new Error("Approval revoked");
      setStatus(edit.checked ? "Connected · editing allowed" : "Connected · read-only");
      panel.dataset.state = edit.checked ? "editing" : "connected";
      if (edit.checked) {
        panel.hidden = true;
        launcher.setAttribute("aria-expanded", "false");
      }
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
    const proposal = proposals.current;
    if (
      proposal &&
      !["applied", "rejected/error"].includes(proposal.state) &&
      (proposals.owner !== editor() ||
        Date.now() >= proposal.expiresAt ||
        (["awaiting approval", "approved"].includes(proposal.state) &&
          proposal.expectedRevision !== new ModellingAPI(editor(), () => false).revision))
    )
      proposals.invalidate();
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
