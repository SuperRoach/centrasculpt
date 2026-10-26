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
    if (![center.x,center.y,center.z,radius,strength,elapsedSeconds].every(Number.isFinite) || radius <= 0 || strength <= 0 || elapsedSeconds <= 0) return null;
    const dt = Math.min(elapsedSeconds, 0.1); // Avoid a giant dab after backgrounding the browser.
    const from = this.previous ?? center;
    const distance = Math.hypot(center.x-from.x,center.y-from.y,center.z-from.z);
    if(freeSpace&&mode!=='smooth'){
      const dirty=volume.brush(center,radius,mode,dt,record,hardness,true,strength,from,mirror);
      this.previous={...center};if(dirty)onDirty?.(dirty);return dirty;
    }
    const steps = Math.min(256, Math.max(1, Math.ceil(dt * 120), Math.ceil(distance / (radius * 0.2))));
    const amount = mode === 'smooth' ? Math.min(strength,1) * dt * 20 / steps : radius * Math.min(strength,1) * dt * 1.2 / steps;
    let dirty: Bounds | null = null;
    for (let i=1; i<=steps; i++) {
      const t=i/steps;
      const changed=volume.brush({x:from.x+(center.x-from.x)*t,y:from.y+(center.y-from.y)*t,z:from.z+(center.z-from.z)*t},radius,mode,amount,record,hardness,freeSpace,strength,undefined,mirror);
      dirty=mergeBounds(dirty,changed);if(changed)onDirty?.(changed);
    }
    this.previous = {...center};
    return dirty;
  }
}
