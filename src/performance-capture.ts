import { TimingWindow } from "./sculpt-metrics";
/** Opt-in bounded diagnostics. Intervals and queue age are proxies, not photon/GPU latency. */
export class PerformanceCapture {
  active = false;
  label = "";
  private previous: number | null = null;
  private dirtySince: number | null = null;
  private readonly frame = new TimingWindow();
  private readonly cpu = new TimingWindow();
  private readonly input = new TimingWindow();
  private rows: unknown[] = [];
  private lastSample = -Infinity;
  private frames = 0;
  start(label: string): void {
    this.stop();
    this.label = label;
    this.rows = [];
    this.frames = 0;
    this.lastSample = -Infinity;
    this.frame.reset();
    this.cpu.reset();
    this.input.reset();
    this.active = true;
  }
  stop(): void {
    this.active = false;
    this.previous = this.dirtySince = null;
  }
  tick(now: number, cpu: number, input: number, pending: number): void {
    if (!this.active) return;
    if (this.previous !== null) this.frame.add(now - this.previous);
    this.previous = now;
    this.cpu.add(cpu);
    this.input.add(input);
    this.frames++;
    if (pending) {
      this.dirtySince ??= now;
    } else this.dirtySince = null;
  }
  sample(now: number, details: unknown): void {
    if (!this.active || now - this.lastSample < 1000) return;
    this.lastSample = now;
    this.rows.push({
      time: now,
      frames: this.frames,
      frame: this.frame.summary(),
      cpu: this.cpu.summary(),
      input: this.input.summary(),
      dirtyQueueAgeMs: this.dirtySince === null ? 0 : now - this.dirtySince,
      details: typeof details === "function" ? details() : details,
    });
    if (this.rows.length > 1800) this.rows.shift();
  }
  snapshot() {
    return {
      version: 1,
      label: this.label,
      scope:
        "Callback CPU through render (excludes capture overhead), interval and dirty-queue age proxies; not GPU or photon latency. Rolling 240 samples; last 1800 seconds.",
      frames: this.frames,
      rows: this.rows.slice(),
    };
  }
}
export const questCapture = new PerformanceCapture();
