import { activityLogo } from "./activity-logo";
import type { ExportProgress } from "./export-mesh";

// Group related substeps so the line stays consistent through each kind of work.
function exportStepKind(stage: string): string {
  if (/^(evaluating|sampling)/i.test(stage)) return "sampling";
  if (/^meshing/i.test(stage)) return "meshing";
  if (/^(encoding|packing|preparing GLB)/i.test(stage)) return "encoding";
  if (
    /^(checking|validating|stabilising|matching precision|publishing precision|welding exact STL|indexing STL|sorting STL)/i.test(
      stage,
    )
  )
    return "validation";
  if (/^(transforming|scaling|measuring physical)/i.test(stage)) return "sizing";
  if (/planar|plane|compact|welding|orienting|winding|curved/i.test(stage)) return "optimisation";
  return "preparation";
}

/** Small, local activity indicator; percentages refer to the current stage only. */
export function createExportFeedback(
  host: HTMLElement,
  onBusy: (busy: boolean) => void = () => {},
) {
  const activity = document.createElement("div");
  activity.className = "export-activity";
  activity.hidden = true;
  activity.innerHTML = `${activityLogo}<div class="export-activity-detail"><span class="export-elapsed"></span><progress aria-label="Current export stage"></progress></div>`;
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
      onBusy(true);
      host.setAttribute("aria-busy", "true");
      bar.removeAttribute("value");
      bar.setAttribute("aria-label", "Preparing export");
      activity.dataset.stepKind = "preparation";
      tick();
      timer = setInterval(tick, 1000);
    },
    progress(p: ExportProgress) {
      const kind = exportStepKind(p.stage);
      if (activity.dataset.stepKind !== kind) activity.dataset.stepKind = kind;
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
      onBusy(false);
      host.setAttribute("aria-busy", "false");
    },
  };
}
