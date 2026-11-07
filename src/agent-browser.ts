import "./agent-access.css";
import credentials from "virtual:centra-agent";
import type { Box3, Object3D } from "three";
import { AgentActivityHistory } from "./agent-activity";
import { AgentFeedback } from "./agent-feedback";

export { frameAgentBounds } from "./agent-feedback";

import { type AgentJob, AgentProposals, agentExecutor } from "./agent-access";
import { readAgentEditingPreference, saveAgentEditingPreference } from "./agent-preferences";
import type { IndependentLayers } from "./independent-layers";
import { ModellingAPI } from "./modelling-api";

export function mountAgentAccess(
  editor: () => IndependentLayers,
  blocked: () => boolean,
  changed: () => void,
  viewport?: { scene: Object3D; frame: (bounds: Box3) => void; blocked: () => boolean },
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
    <label class="agent-access-remember"><input type="checkbox" aria-label="Remember editing choice on this browser">Remember editing choice on this browser</label>
    <p class="agent-access-help"></p>
    <button class="agent-access-revoke" type="button" hidden>Revoke access</button>`;
  const status = panel.querySelector<HTMLParagraphElement>(".agent-access-status")!;
  const help = panel.querySelector<HTMLParagraphElement>(".agent-access-help")!;
  const connect = panel.querySelector<HTMLButtonElement>(".agent-access-connect")!;
  const edit = panel.querySelector<HTMLInputElement>("input")!;
  // Keep the accessible name concise; supporting copy is a description.
  edit.setAttribute("aria-label", "Allow editing (includes Undo)");
  const revoke = panel.querySelector<HTMLButtonElement>(".agent-access-revoke")!;
  const remember = panel.querySelector<HTMLInputElement>(".agent-access-remember input")!;
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    /* Storage blocked: connection still starts read-only. */
  }
  let remembered = storage ? readAgentEditingPreference(storage) : undefined;
  remember.checked = remembered !== undefined;
  const rememberChoice = () => {
    const choice = remember.checked ? edit.checked : undefined;
    if (!storage || !saveAgentEditingPreference(storage, choice)) {
      remember.checked = false;
      remembered = undefined;
      help.textContent = "Browser storage is unavailable. Editing choice will not be remembered.";
    } else remembered = choice;
  };
  remember.onchange = rememberChoice;

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
  const historyPanel = document.createElement("section");
  historyPanel.className = "agent-history";
  historyPanel.setAttribute("aria-label", "Recent agent activity");
  const historyHeading = document.createElement("h3");
  historyHeading.textContent = "Recent changes";
  const historyRows = document.createElement("ol");
  historyPanel.append(historyHeading, historyRows);
  panel.append(historyPanel);
  const feedback = viewport
    ? new AgentFeedback(
        viewport.scene,
        editor,
        () =>
          viewport.blocked() ||
          blocked() ||
          editor().drawing ||
          editor().transforming ||
          editor().modellingBusy ||
          !editor().recoveryReady,
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        viewport.frame,
      )
    : undefined;
  let feedbackFrame = 0;
  const animateFeedback = () => {
    feedbackFrame = 0;
    if (feedback?.tick()) feedbackFrame = requestAnimationFrame(animateFeedback);
  };
  const history = new AgentActivityHistory(() => {
    historyRows.replaceChildren();
    const entries = history.snapshot();
    historyPanel.hidden = !entries.length;
    for (const entry of entries) {
      const row = document.createElement("li");
      row.dataset.outcome = entry.outcome;
      const description = document.createElement("strong");
      description.textContent = `${entry.description} · ${entry.outcome === "committed" ? "Applied" : "Failed"}`;
      const time = document.createElement("time");
      time.dateTime = new Date(entry.time).toISOString();
      time.textContent = new Date(entry.time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const objects = document.createElement("details");
      const objectLabel = document.createElement("summary");
      objectLabel.textContent =
        entry.error ||
        entry.objects.map((object) => `${object.status}: ${object.name}`).join(" · ") ||
        "No affected objects";
      const ids = document.createElement("p");
      ids.textContent = entry.objects
        .map((object) => `${object.status} · ${object.name} · ${object.id}`)
        .join("\n");
      objects.append(objectLabel, ids);
      row.append(description, time, objects);
      const surviving = entry.objects
        .filter((object) => object.status !== "deleted")
        .map((object) => object.id);
      if (entry.outcome === "committed" && surviving.length && feedback) {
        const show = document.createElement("button");
        show.type = "button";
        show.textContent = "Show me";
        const message = document.createElement("span");
        message.setAttribute("role", "status");
        show.onclick = () => {
          message.textContent = feedback.show(surviving).message;
        };
        row.append(show, message);
      }
      historyRows.append(row);
    }
  });
  history.sync(editor());

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
    (entry, owner) => {
      if (!approved || owner !== editor()) return;
      if (history.sync(owner)) feedback?.clear();
      history.add(entry);
      if (entry.outcome === "committed") {
        feedback?.highlight(entry);
        if (!feedbackFrame) feedbackFrame = requestAnimationFrame(animateFeedback);
      }
    },
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
    proposals.current = undefined;
    proposals.owner = undefined;
    proposals.notify();
    history.clear();
    feedback?.clear();
    if (feedbackFrame) cancelAnimationFrame(feedbackFrame);
    feedbackFrame = 0;
    approved = false;
    edit.checked = false;
    edit.disabled = true;
    running?.abort();
    setStatus(message);
    connect.disabled = false;
    connect.hidden = false;
    revoke.hidden = true;
    panel.dataset.state = "disconnected";
    help.textContent =
      remember.checked && remembered === true
        ? "Your editing choice will apply after you approve this connection."
        : "Starts read-only. You can revoke access at any time.";
  };
  reset("Not connected");
  connect.onclick = async () => {
    connect.disabled = true;
    setStatus("Connecting…");
    try {
      const editing = remember.checked && remembered === true;
      await post("/approve", { editing });
      edit.checked = editing;
      approved = true;
      edit.disabled = false;
      connect.disabled = true;
      connect.hidden = true;
      revoke.hidden = false;
      panel.dataset.state = editing ? "editing" : "connected";
      help.textContent = editing
        ? "Remembered editing choice applied. Plans still need separate approval."
        : "Agents can inspect your scene. Editing is off.";
      setStatus(editing ? "Connected · editing allowed" : "Connected · read-only");
      if (editing) {
        panel.hidden = true;
        launcher.setAttribute("aria-expanded", "false");
      }
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
    if (remember.checked) rememberChoice();
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
    if (history.sync(editor())) {
      feedback?.clear();
      proposals.invalidate();
      proposals.current = undefined;
      proposals.owner = undefined;
      proposals.notify();
    }
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
      feedback?.dispose();
      void post("/revoke").catch(() => {});
    },
    { once: true },
  );
}
