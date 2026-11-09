/** Frame-time feedback for disposable desktop Boolean drafts, independent of saved quality. */
export class DesktopPreviewPerformance {
  private cap = 64;
  private elapsed = 0;
  private frames = 0;
  private recoveryWindows = 0;
  get resolution(): number {
    return this.cap;
  }
  observeFrame(milliseconds: number, visible = true): number {
    // Ignore suspension, tab changes and debugger pauses rather than judging the machine by them.
    if (!visible || !Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 250) {
      this.elapsed = 0;
      this.frames = 0;
      this.recoveryWindows = 0;
      return this.cap;
    }
    this.elapsed += milliseconds;
    this.frames++;
    if (this.elapsed < 1000 || this.frames < 8) return this.cap;
    const fps = (this.frames * 1000) / this.elapsed;
    this.elapsed = 0;
    this.frames = 0;
    const target = fps < 20 ? 18 : fps < 28 ? 24 : fps < 40 ? 32 : fps < 55 ? 48 : 64;
    if (target < this.cap) {
      this.cap = target;
      this.recoveryWindows = 0;
    } else if (target > this.cap && fps >= 55) {
      // Recover one step after three smooth windows; don't oscillate near a threshold.
      if (++this.recoveryWindows >= 3) {
        const levels = [18, 24, 32, 48, 64];
        this.cap = levels[levels.indexOf(this.cap) + 1];
        this.recoveryWindows = 0;
      }
    } else this.recoveryWindows = 0;
    return this.cap;
  }
}
