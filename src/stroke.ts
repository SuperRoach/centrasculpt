import { mergeBounds } from './sdf';
import type { VolumeStore } from './volume-store';
import type { Bounds, BrushMode, Point3, VoxelChangeListener, MirrorPlane } from './sdf';

/** Integrates elapsed time into bounded dabs and resamples motion to avoid gaps.
 * Legacy stationary holds continue sculpting; free-space constructive dabs deposit
 * immediately and repeated holds are idempotent. Both retain distance interpolation.
 */
export class ClayStroke {
  private previous: Point3 | null = null;
  reset(): void { this.previous = null; }
  apply(volume: VolumeStore, center: Point3, radius: number, mode: BrushMode, strength: number, elapsedSeconds: number, record?: VoxelChangeListener, hardness = 0, onDirty?: (bounds: Bounds) => void, freeSpace = false, mirror?:MirrorPlane): Bounds | null {
    const work=this.applySteps(volume,center,radius,mode,strength,elapsedSeconds,record,hardness,onDirty,freeSpace,mirror);
    let step=work.next();while(!step.done)step=work.next();return step.value;
  }
  *applySteps(volume: VolumeStore, center: Point3, radius: number, mode: BrushMode, strength: number, elapsedSeconds: number, record?: VoxelChangeListener, hardness = 0, onDirty?: (bounds: Bounds) => void, freeSpace = false, mirror?:MirrorPlane):Generator<void,Bounds|null> {
    if (![center.x,center.y,center.z,radius,strength,elapsedSeconds].every(Number.isFinite) || radius <= 0 || strength <= 0 || elapsedSeconds <= 0) return null;
    const dt = Math.min(elapsedSeconds, 0.1); // Avoid a giant dab after backgrounding the browser.
    const from = this.previous ?? center;
    const distance = Math.hypot(center.x-from.x,center.y-from.y,center.z-from.z);
    if(freeSpace&&(mode==='add'||mode==='subtract')){
      const dirty=volume.brush(center,radius,mode,dt,record,hardness,true,strength,from,mirror);
      this.previous={...center};if(dirty)onDirty?.(dirty);return dirty;
    }
    const steps = Math.min(256, Math.max(1, Math.ceil(dt * 120), Math.ceil(distance / (radius * 0.2))));
    // Crease's normal component was only one third of the shared clay rate.
    // Restore that application rate; each backward map retains its existing
    // voxel/displacement/derivative caps in brushSteps (no extra passes).
    const amount = (mode === 'smooth'||mode==='mask'||mode==='mask-erase') ? Math.min(strength,1) * dt * 20 / steps : radius * Math.min(strength,1) * dt * 1.2 * (mode==='crease'?3:1) / steps;
    let dirty: Bounds | null = null;
    for (let i=1; i<=steps; i++) {
      const t=i/steps;
      const changed=yield* volume.brushSteps({x:from.x+(center.x-from.x)*t,y:from.y+(center.y-from.y)*t,z:from.z+(center.z-from.z)*t},radius,mode,amount,record,hardness,freeSpace,strength,undefined,mirror);
      dirty=mergeBounds(dirty,changed);if(changed)onDirty?.(changed);
    }
    this.previous = {...center};
    return dirty;
  }
}
