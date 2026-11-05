import type { ExportProgress } from "./export-mesh";

/** Small, local activity indicator; percentages refer to the current stage only. */
export function createExportFeedback(host: HTMLElement) {
  const activity = document.createElement("div");
  activity.className = "export-activity";
  activity.hidden = true;
  activity.innerHTML = `<svg class="export-logo" viewBox="0 0 64 64" width="28" height="28" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true"><circle class="export-logo-outer" cx="32" cy="32" r="23"/><circle class="export-logo-inner" cx="32" cy="32" r="14"/></svg><div class="export-activity-detail"><span class="export-elapsed"></span><progress aria-label="Current export stage"></progress></div>`;
  const elapsed = activity.querySelector<HTMLSpanElement>("span")!;
  const bar = activity.querySelector<HTMLProgressElement>("progress")!;
  host.prepend(activity);
  let timer: ReturnType<typeof setInterval> | undefined;
  let started = 0;
  const tick = () => {
    const seconds = Math.floor((performance.now() - started) / 1000);
    elapsed.textContent = `Exporting · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} elapsed`;
  };
  return {
    start() {
      if (timer !== undefined) clearInterval(timer);
      started = performance.now();
      activity.hidden = false;
      host.setAttribute("aria-busy", "true");
      bar.removeAttribute("value");
      tick();
      timer = setInterval(tick, 1000);
    },
    progress(p: ExportProgress) {
      if (p.total > 0) {
        bar.max = p.total;
        bar.value = Math.max(0, Math.min(p.completed, p.total));
      } else bar.removeAttribute("value");
      bar.setAttribute("aria-label", p.stage);
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
      activity.hidden = true;
      host.setAttribute("aria-busy", "false");
    },
  };
}
