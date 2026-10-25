import type { Bounds, VoxelChangeListener } from './sdf';
import type { VolumeStore } from './volume-store';
export type HistoryKind='stroke'|'reset'|'shape-stamp';
export type HistoryTransaction={layerId:string;kind:HistoryKind;changedVoxels:number};
type Action = { layerId:string;kind:HistoryKind } & { indices: Uint32Array; before: Float32Array; after: Float32Array; bounds: Bounds };

/** Sparse, exact Float32 deltas. Each voxel's original value is captured only once per action. */
export class SculptHistory {
  private pending: Map<number, { before: number; after: number }> | null = null;
  private readonly past: Action[] = [];
  private readonly future: Action[] = [];
  private bytes = 0;
  private pendingKind: HistoryKind='stroke';
  lastApplied: HistoryTransaction | null=null;
  constructor(private readonly volume: VolumeStore, private readonly byteLimit = 32 * 1024 * 1024, private readonly actionLimit = 100, readonly targetLayerId='base', private readonly canEdit=()=>true) {}
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  discardRedo(): void {
    for(const action of this.future)this.bytes-=action.indices.length*12;
    this.future.length=0;
  }
  get active(): boolean { return this.pending !== null; }
  get undoCount(): number { return this.past.length; }
  get redoCount(): number { return this.future.length; }
  get memoryBytes(): number { return this.bytes; }
  get nextUndo(): HistoryTransaction | null {const action=this.past.at(-1);return action?{layerId:action.layerId,kind:action.kind,changedVoxels:action.indices.length}:null;}
  begin(kind: HistoryKind='stroke'): void {
    if(!this.canEdit())throw new Error('Target layer is hidden or locked.');
    if (this.pending) throw new Error('A history action is already active');
    this.pendingKind=kind;
    this.pending = new Map();
  }
  readonly record: VoxelChangeListener = (index, before, after) => {
    if (!this.pending) return;
    const existing = this.pending.get(index);
    if (existing) existing.after = after;
    else this.pending.set(index, { before, after });
  };
  commit(): boolean {
    if (!this.pending) return false;
    const entries = Array.from(this.pending).filter(([, value]) => value.before !== value.after);
    this.pending = null;
    if (!entries.length) return false; // Clicking empty space does not destroy redo.
    for (const action of this.future) this.bytes -= action.indices.length * 12;
    this.future.length = 0;
    const indices = new Uint32Array(entries.length), before = new Float32Array(entries.length), after = new Float32Array(entries.length);
    const n = this.volume.resolution;
    const bounds: Bounds = { min: [n,n,n], max: [0,0,0] };
    entries.forEach(([index, value], i) => {
      indices[i]=index; before[i]=value.before; after[i]=value.after;
      const point = [index % n, Math.floor(index / n) % n, Math.floor(index / (n*n))];
      point.forEach((v, axis) => { bounds.min[axis]=Math.min(bounds.min[axis],v); bounds.max[axis]=Math.max(bounds.max[axis],v); });
    });
    this.past.push({indices,before,after,bounds,layerId:this.targetLayerId,kind:this.pendingKind});
    this.bytes += indices.length * 12;
    // Retain the latest action even when a single very large action exceeds the soft budget.
    while (this.past.length > 1 && (this.bytes > this.byteLimit || this.past.length > this.actionLimit)) {
      this.bytes -= this.past.shift()!.indices.length * 12;
    }
    return true;
  }
  undo(record?:VoxelChangeListener): Bounds | null { return this.move(this.past, this.future, 'before',record); }
  redo(record?:VoxelChangeListener): Bounds | null { return this.move(this.future, this.past, 'after',record); }
  private move(from: Action[], to: Action[], key: 'before' | 'after',record?:VoxelChangeListener): Bounds | null {
    if(!this.canEdit())throw new Error('Target layer is hidden or locked.');
    if (this.active) throw new Error('Finish the active stroke before changing history');
    const action = from.pop();
    if (!action) return null;
    for (let i=0;i<action.indices.length;i++) {record?.(action.indices[i],this.volume.readVoxel(action.indices[i]),action[key][i]);this.volume.writeVoxel(action.indices[i],action[key][i]);}
    this.lastApplied={layerId:action.layerId,kind:action.kind,changedVoxels:action.indices.length};
    to.push(action);
    return action.bounds;
  }
}
