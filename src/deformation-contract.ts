import type {VolumeBounds,VolumeStore} from './volume-store';
import type {Vec3,VolumeTransform} from './transform';
/** Reserved worker/Elastic adapter boundary. Phase 2.1 currently uses the concrete
 * IndependentLayers.commitMove + deformation-reconstruction functions. A request
 * pins immutable intent and source identity; preview material state is not input. */
export type DeformationIntent=Readonly<{
 projectId:string;layerId:string;source:VolumeStore;surfaceRevision:number;
 layerTransform:VolumeTransform;spacing:Vec3;
 target:Vec3;displacement:Vec3;radius:number;falloff:number;strength:number;
 mode:'non-elastic'|'elastic';affectedBounds:VolumeBounds;
}>;
export type ReconstructionProgress={stage:'planning'|'growth'|'reconstruction'|'validation'|'meshing';completed:number;total:number};
export type ReconstructedPatch=Readonly<{indices:Uint32Array;before:Float32Array;after:Float32Array;bounds:VolumeBounds}>;
export interface DeformationReconstructor {
 /** Read-only/budgeted preparation. Result owns buffers; must not alias source.
  * A future worker adapter must preserve the current command, which revalidates the pinned source/locks,
  * stages required growth+history+meshes, then publishes one action atomically. */
 prepare(intent:DeformationIntent,signal:AbortSignal,progress:(p:ReconstructionProgress)=>void):Promise<ReconstructedPatch>;
}
