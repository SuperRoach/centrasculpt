/** A bounded CPU scheduler for the offline sculpt replay. */
export class DirtyChunkQueue {
  pending = new Map();
  tick = 0;
  peak = 0;
  coalesced = 0;
  slices = [];
  ageTicks = [];
  refusals = 0;
  serviced = 0;
  localAgeTicks = [];
  focus = null;
  deadlineSelections = 0;
  predictedStops = 0;
  firstChunkOverBudget = 0;
  localSelections = 0;

  constructor(
    capacity,
    rebuild,
    maxChunks = 4,
    budgetMs = 2,
    distance = null,
    prioritize = false,
    deadlineTicks = null,
    cost = null,
    now = () => performance.now(),
    localQuota = null,
  ) {
    this.capacity = capacity;
    this.rebuild = rebuild;
    this.maxChunks = maxChunks;
    this.budgetMs = budgetMs;
    this.distance = distance;
    this.prioritize = prioritize;
    this.deadlineTicks = deadlineTicks;
    this.cost = cost;
    this.now = now;
    this.localQuota = localQuota;
  }

  canAdmit(keys) {
    return this.pending.size + keys.filter((key) => !this.pending.has(key)).length <= this.capacity;
  }

  publish(keys, commit) {
    if (!this.canAdmit(keys)) {
      this.refusals++;
      throw new Error("Dirty chunk queue budget");
    }
    commit();
    for (const key of keys) {
      if (this.pending.has(key)) this.coalesced++;
      else this.pending.set(key, this.tick);
    }
    this.peak = Math.max(this.peak, this.pending.size);
  }

  slice() {
    const start = this.now();
    let chunks = 0;
    let local = 0;
    while (this.pending.size) {
      let key = this.pending.keys().next().value;
      const deadlineDue =
        this.deadlineTicks !== null && this.tick - this.pending.get(key) >= this.deadlineTicks;
      if (deadlineDue) this.deadlineSelections++;
      const priorityTurn = this.deadlineTicks !== null ? !deadlineDue : this.serviced % 2 === 0;
      let selectedLocal = false;
      if (
        this.prioritize &&
        this.focus &&
        priorityTurn &&
        (this.localQuota === null || local < this.localQuota)
      ) {
        let best = Infinity;
        for (const candidate of this.pending.keys()) {
          const score = this.distance(candidate, this.focus);
          if (score < best && (this.localQuota === null || score <= 12 ** 2)) {
            best = score;
            key = candidate;
            selectedLocal = true;
          }
        }
      }
      const bucket = this.cost?.classify(key);
      const before = this.cost ? this.now() : 0;
      if (chunks && this.cost && before - start + this.cost.estimate(bucket) > this.budgetMs) {
        this.predictedStops++;
        break;
      }
      const firstTick = this.pending.get(key);
      this.rebuild([key]);
      if (selectedLocal) {
        local++;
        this.localSelections++;
      }
      if (this.cost) {
        const after = this.now();
        this.cost.observe(bucket, after - before);
        if (!chunks && after - start > this.budgetMs) this.firstChunkOverBudget++;
      }
      this.pending.delete(key);
      this.ageTicks.push(this.tick - firstTick);
      if (this.distance && this.focus && this.distance(key, this.focus) <= 12 ** 2)
        this.localAgeTicks.push(this.tick - firstTick);
      this.serviced++;
      chunks++;
      if (chunks >= this.maxChunks || this.now() - start >= this.budgetMs) break;
    }
    if (chunks) this.slices.push({ chunks, ms: this.now() - start });
    this.tick++;
  }

  drain() {
    const start = this.tick;
    while (this.pending.size) this.slice();
    return this.tick - start;
  }
}
