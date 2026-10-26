import {SDFVolume} from './sdf';
import {assertExactDenseGrowth} from './dense-growth';
import type { Bounds, VoxelChangeListener } from './sdf';
import type { VolumeStore } from './volume-store';
export type HistoryKind='stroke'|'reset'|'shape-stamp'|'move';
export type HistoryTransaction={layerId:string;kind:HistoryKind;changedVoxels:number};
type Action = { layerId:string;kind:HistoryKind } & { indices: Uint32Array; before: Float32Array; after: Float32Array; bounds: Bounds };

/** Sparse, exact Float32 deltas. Each voxel's original value is captured only once per action. */
export class SculptHistory {
  private pending: Map<number, { before: number; after: number }> | null = null;
  private past: Action[] = [];
  private future: Action[] = [];
  private bytes = 0;
  private revision=0;
  private pendingKind: HistoryKind='stroke';
  pendingBudgetBytes=Infinity;
  lastApplied: HistoryTransaction | null=null;
  constructor(private volume: VolumeStore, private readonly byteLimit = 32 * 1024 * 1024, private readonly actionLimit = 100, readonly targetLayerId='base', private readonly canEdit=()=>true) {}
  /** Stage index remapping for past, redo and the in-flight action. Capacity is
   * retained on undo/cancel; only values are replayed. No empty-grid snapshots. */
  prepareVolumeRebind(next:SDFVolume):()=>void{
    const revision=this.revision,old=this.volume;if(!(old instanceof SDFVolume))throw new Error('History growth requires a dense source.');
    const offset=assertExactDenseGrowth(old,next),[nx,ny]=old.dimensions;
    const remap=(index:number)=>next.index(index%nx+offset[0],Math.floor(index/nx)%ny+offset[1],Math.floor(index/(nx*ny))+offset[2]);
    const shift=(b:Bounds):Bounds=>({min:b.min.map((v,a)=>v+offset[a]) as [number,number,number],max:b.max.map((v,a)=>v+offset[a]) as [number,number,number]});
    const actions=[...this.past,...this.future],staged=actions.map(action=>({action,indices:action.indices.map(remap),bounds:shift(action.bounds)})),pending=this.pending,newPending=pending?new Map([...pending].map(([index,value])=>[remap(index),value])):null;
    let used=false;return ()=>{assertExactDenseGrowth(old,next);if(used||this.revision!==revision||this.volume!==old||this.pending!==pending||this.past.length+this.future.length!==actions.length)throw new Error('Stale history growth preparation.');used=true;for(const item of staged){item.action.indices=item.indices;item.action.bounds=item.bounds;}this.pending=newPending;this.volume=next;this.revision++;};
  }
  get pendingMemoryEstimate():number{return (this.pending?.size??0)*160;}
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  discardRedo(): void {this.revision++;
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
    this.revision++;this.pendingKind=kind;
    this.pending = new Map();
  }
  readonly record: VoxelChangeListener = (index, before, after) => {
    if (!this.pending) return;this.revision++;
    const existing = this.pending.get(index);
    if (existing) existing.after = after;
    else {if((this.pending.size+1)*160>this.pendingBudgetBytes)throw new Error('Edit history memory safety limit reached. The unfinished edit must be cancelled.');this.pending.set(index, { before, after });}
  };
  commit(): boolean {
    if (!this.pending) return false;
    this.revision++;const entries = Array.from(this.pending).filter(([, value]) => value.before !== value.after);
    if (!entries.length) {this.pending=null;return false;} // Clicking empty space does not destroy redo.
    const indices = new Uint32Array(entries.length), before = new Float32Array(entries.length), after = new Float32Array(entries.length);
    const [nx,ny,nz] = this.volume.dimensions;
    const bounds: Bounds = { min: [nx,ny,nz], max: [0,0,0] };
    entries.forEach(([index, value], i) => {
      indices[i]=index; before[i]=value.before; after[i]=value.after;
      const point = [index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx*ny))];
      point.forEach((v, axis) => { bounds.min[axis]=Math.min(bounds.min[axis],v); bounds.max[axis]=Math.max(bounds.max[axis],v); });
    });
    const retained=this.retain({indices,before,after,bounds,layerId:this.targetLayerId,kind:this.pendingKind});this.pending=null;return retained;
  }
  /** Trusted staged stamp patch. Snapshot arrays are copied before any source writes,
   * avoiding a second object/Map entry per voxel while retaining exact undo data. */
  commitPatch(kind:HistoryKind,patch:{indices:Uint32Array;before:Float32Array;after:Float32Array;bounds:Bounds|null}):boolean {
    if(!this.canEdit())throw new Error('Target layer is hidden or locked.');
    if(this.active)throw new Error('Finish the active history action first.');
    if(!patch.indices.length)return false;
    if(!patch.bounds||patch.before.length!==patch.indices.length||patch.after.length!==patch.indices.length)throw new Error('Invalid staged history patch.');
    const action={indices:patch.indices.slice(),before:patch.before.slice(),after:patch.after.slice(),bounds:{min:[...patch.bounds.min],max:[...patch.bounds.max]} as Bounds,layerId:this.targetLayerId,kind};
    return this.retain(action);
  }
  /** Trusted atomic Move branch. Candidate is an exact lattice copy before
   * patch application. No live history/store mutation until the returned publish. */
  prepareMoveReplacement(next:SDFVolume,patch:{indices:Uint32Array;before:Float32Array;after:Float32Array;bounds:Bounds|null}):{publish:()=>void;undoCount:number}{
    if(!(this.volume instanceof SDFVolume)||this.active||!this.canEdit())throw new Error('Move history target is unavailable.');
    if(!patch.indices.length||!patch.bounds||patch.before.length!==patch.indices.length||patch.after.length!==patch.indices.length)throw new Error('Invalid Move history patch.');
    const old=this.volume,revision=this.revision,oldMin=old.latticeMin,newMin=next.latticeMin,od=old.dimensions,nd=next.dimensions,offset=oldMin.map((v,a)=>v-newMin[a]);
    if(next.step!==old.step||next.resolution!==old.resolution||next.extent!==old.extent||!offset.every((v,a)=>Number.isInteger(v)&&v>=0&&v+od[a]<=nd[a]))throw new Error('Move replacement must preserve the original lattice.');
    for(let i=0;i<patch.indices.length;i++){const id=patch.indices[i];if(id>=next.values.length||i>0&&id<=patch.indices[i-1]||next.values[id]!==patch.before[i]||!Number.isFinite(patch.after[i])||Math.abs(patch.after[i])>Math.fround(next.extent*4))throw new Error('Move history patch is stale or invalid.');}
    const same=offset.every(v=>v===0)&&nd.every((v,a)=>v===od[a]),remap=(id:number)=>next.index(id%od[0]+offset[0],Math.floor(id/od[0])%od[1]+offset[1],Math.floor(id/(od[0]*od[1]))+offset[2]);
    const shift=(b:Bounds):Bounds=>({min:b.min.map((v,a)=>v+offset[a]) as [number,number,number],max:b.max.map((v,a)=>v+offset[a]) as [number,number,number]});
    const past=this.past.map(a=>same?a:{...a,indices:a.indices.map(remap),bounds:shift(a.bounds)});
    past.push({layerId:this.targetLayerId,kind:'move',indices:patch.indices.slice(),before:patch.before.slice(),after:patch.after.slice(),bounds:{min:[...patch.bounds.min],max:[...patch.bounds.max]}});
    let bytes=past.reduce((n,a)=>n+a.indices.length*12,0);while(past.length>1&&(bytes>this.byteLimit||past.length>this.actionLimit))bytes-=past.shift()!.indices.length*12;
    const future:Action[]=[];let used=false;return {undoCount:past.length,publish:()=>{if(used||this.revision!==revision||this.volume!==old||this.active||!this.canEdit())throw new Error('Stale Move history preparation.');used=true;this.volume=next;this.past=past;this.future=future;this.bytes=bytes;this.revision++;}};
  }
  private retain(action:Action):boolean {
    this.discardRedo();
    this.past.push(action);
    this.bytes += action.indices.length * 12;
    // Retain the latest action even when a single very large action exceeds the soft budget.
    while (this.past.length > 1 && (this.bytes > this.byteLimit || this.past.length > this.actionLimit)) {
      this.bytes -= this.past.shift()!.indices.length * 12;
    }
    return true;
  }
  cancel(record?:VoxelChangeListener):Bounds|null {
    if(!this.pending)return null;this.revision++;const pending=this.pending;this.pending=null;let bounds:Bounds|null=null;const [nx,ny]=this.volume.dimensions;
    for(const [index,value]of pending){if(value.before===value.after)continue;record?.(index,this.volume.readVoxel(index),value.before);this.volume.writeVoxel(index,value.before);const p=[index%nx,Math.floor(index/nx)%ny,Math.floor(index/(nx*ny))] as [number,number,number];if(!bounds)bounds={min:[...p],max:[...p]};else for(let a=0;a<3;a++){bounds.min[a]=Math.min(bounds.min[a],p[a]);bounds.max[a]=Math.max(bounds.max[a],p[a]);}}
    return bounds;
  }
  undo(record?:VoxelChangeListener): Bounds | null { return this.move(this.past, this.future, 'before',record); }
  redo(record?:VoxelChangeListener): Bounds | null { return this.move(this.future, this.past, 'after',record); }
  private move(from: Action[], to: Action[], key: 'before' | 'after',record?:VoxelChangeListener): Bounds | null {
    if(!this.canEdit())throw new Error('Target layer is hidden or locked.');
    if (this.active) throw new Error('Finish the active stroke before changing history');
    this.revision++;const action = from.pop();
    if (!action) return null;
    for (let i=0;i<action.indices.length;i++) {record?.(action.indices[i],this.volume.readVoxel(action.indices[i]),action[key][i]);this.volume.writeVoxel(action.indices[i],action[key][i]);}
    this.lastApplied={layerId:action.layerId,kind:action.kind,changedVoxels:action.indices.length};
    to.push(action);
    return action.bounds;
  }
}
