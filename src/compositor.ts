import type {ExportSource} from './export-mesh';
import { Group, Vector3 } from 'three';
import type { Material } from 'three';
import type { SculptProject, SdfLayer, LayerOperation } from './layers';
import { SDFVolume } from './sdf';
import type { Bounds, Point3 } from './sdf';
import { transformMatrix, uniformScale } from './transform';
import { IncrementalMesher } from './mesh';
import { ChunkSurface, buildExportMesh } from './surface';

export function combineSdf(a:number,b:number,operation:LayerOperation):number {
  if(operation==='union')return Math.min(a,b);
  if(operation==='difference')return Math.max(a,-b);
  return Math.max(a,b);
}
/** Prepared inverse matrix and borrowed READ-ONLY grid. No source grid is resampled or written. */
export function prepareLayerSampler(layer:SdfLayer):(x:number,y:number,z:number)=>number {
  const m=transformMatrix(layer.transform).invert().elements,scale=uniformScale(layer.transform);
  const v=layer.volume,[nx,ny,nz]=v.dimensions,bounds=v.bounds,h=v.step,data=v.getDenseView();
  const at=(x:number,y:number,z:number)=>data?data[x+nx*(y+ny*z)]:v.readVoxel(v.index(x,y,z));
  return (wx,wy,wz)=>{
    const x=m[0]*wx+m[4]*wy+m[8]*wz+m[12],y=m[1]*wx+m[5]*wy+m[9]*wz+m[13],z=m[2]*wx+m[6]*wy+m[10]*wz+m[14];
    const gx=Math.max(0,Math.min(nx-1,(x-bounds.min[0])/h)),gy=Math.max(0,Math.min(ny-1,(y-bounds.min[1])/h)),gz=Math.max(0,Math.min(nz-1,(z-bounds.min[2])/h));
    const ix=Math.min(nx-2,Math.floor(gx)),iy=Math.min(ny-2,Math.floor(gy)),iz=Math.min(nz-2,Math.floor(gz)),tx=gx-ix,ty=gy-iy,tz=gz-iz;
    const a=at(ix,iy,iz)*(1-tx)+at(ix+1,iy,iz)*tx,b=at(ix,iy+1,iz)*(1-tx)+at(ix+1,iy+1,iz)*tx;
    const c=at(ix,iy,iz+1)*(1-tx)+at(ix+1,iy,iz+1)*tx,d=at(ix,iy+1,iz+1)*(1-tx)+at(ix+1,iy+1,iz+1)*tx;
    const value=(a*(1-ty)+b*ty)*(1-tz)+(c*(1-ty)+d*ty)*tz;
    const outside=Math.hypot(Math.max(0,bounds.min[0]-x,x-bounds.max[0]),Math.max(0,bounds.min[1]-y,y-bounds.max[1]),Math.max(0,bounds.min[2]-z,z-bounds.max[2]));
    // Explicit positive exterior extension, continuous with the positive boundary.
    // Clamping alone would incorrectly leave constant-distance slabs outside the volume.
    return (outside>0?Math.max(h*1e-6,value)+outside:value)*scale;
  };
}
export function prepareComposite(layers:readonly SdfLayer[]):(x:number,y:number,z:number)=>number {
  const ordering=layers[0]?.hierarchy?.compositionOrder;const ordered=ordering?[...layers].sort((a,b)=>ordering.indexOf(a.id)-ordering.indexOf(b.id)):layers;
  const sources=ordered.filter(l=>l.visible).map(layer=>({sample:prepareLayerSampler(layer),operation:layer.operation}));
  return (x,y,z)=>{
    if(!sources.length)return 1;
    let result=sources[0].sample(x,y,z);
    for(let i=1;i<sources.length;i++)result=combineSdf(result,sources[i].sample(x,y,z),sources[i].operation);
    return result;
  };
}
export function evaluateComposite(layers:readonly SdfLayer[],point:Point3):number {return prepareComposite(layers)(point.x,point.y,point.z);}
export type CompositeLayout={resolution:number;extent:number;center:[number,number,number];desiredStep:number;capped:boolean};
/** One independent derived world grid. Sampling tries to match the finest world voxel,
 * but is bounded to 192³ (or a lower explicit quality cap). No source is converted. */
export function compositeLayout(layers:readonly SdfLayer[],cap=192):CompositeLayout {
  if(!Number.isInteger(cap)||cap<8||cap>192)throw new Error('Composite resolution cap must be 8–192.');
  const visible=layers.filter(l=>l.visible),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let desiredStep=Infinity;
  for(const layer of visible){const scale=uniformScale(layer.transform),bounds=layer.volume.worldBounds(layer.transform);desiredStep=Math.min(desiredStep,layer.volume.step*scale);for(let i=0;i<3;i++){min[i]=Math.min(min[i],bounds.min[i]);max[i]=Math.max(max[i],bounds.max[i]);}}
  if(!visible.length)return {resolution:8,extent:1,center:[0,0,0],desiredStep:2/7,capped:false};
  const center=min.map((v,i)=>(v+max[i])/2) as [number,number,number],span=Math.max(...max.map((v,i)=>v-min[i]));
  // Padding remains positive for all Boolean operations, closing the extracted surface.
  const extent=span/2+2*Math.max(desiredStep,span/(cap-5));
  const desired=Math.ceil(2*extent/desiredStep)+1,resolution=Math.max(8,Math.min(cap,desired));
  return {resolution,extent,center,desiredStep,capped:desired>cap};
}
export type CompositeStats={samplingMs:number;meshingMs:number;elapsedMs:number;samples:number;chunks:number;totalChunks:number;triangles:number;resolution:number;step:number;capped:boolean;full:boolean};
const yieldUI=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
/** Disposable rendering cache, never part of native serialization or source history. */
export class BooleanComposite {
  readonly group=new Group();
  private surface:ChunkSurface|null=null;
  private mesher:IncrementalMesher|null=null;
  private volume:SDFVolume|null=null;
  private layout:CompositeLayout|null=null;
  private fingerprint='';
  private full=true;
  private regions:Bounds[]=[];
  private version=0;
  private disposed=false;
  private running:Promise<boolean>|null=null;
  private lastEdit=0;
  private failedVersion=-1;
  stats:CompositeStats|null=null;
  constructor(readonly project:SculptProject,private readonly material:Material,private cap=192,private readonly exportMaterial:Material=material){this.group.name='Boolean Preview';}
  setQuality(cap:number):void {if(![64,128,192].includes(cap))throw new Error('Choose a composite cap of 64³, 128³ or 192³.');if(cap!==this.cap){this.cap=cap;this.invalidate();}}
  private metadataKey():string {return JSON.stringify(this.project.layerStack.compositionLayers.map(l=>[l.id,l.visible,l.operation,l.order,l.transform,l.volume.resolution,l.volume.extent,l.volume.dimensions,l.volume.bounds]));}
  syncMetadata():void {const key=this.metadataKey();if(key!==this.fingerprint){this.fingerprint=key;this.invalidate();}}
  /** Allocate cache invalidation before an atomic source publication. */
  prepareInvalidation():()=>void{const regions:Bounds[]=[];return ()=>{this.full=true;this.regions=regions;this.version++;this.lastEdit=performance.now();};}
  invalidate():void {this.full=true;this.regions=[];this.version++;this.lastEdit=performance.now();}
  invalidateLayer(layer:SdfLayer,bounds?:Bounds|null):void {
    if(bounds===null||!layer.visible)return;
    if(!bounds||!this.layout){this.invalidate();return;}
    const matrix=transformMatrix(layer.transform),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],point=new Vector3();
    for(const x of [bounds.min[0]-1,bounds.max[0]+1])for(const y of [bounds.min[1]-1,bounds.max[1]+1])for(const z of [bounds.min[2]-1,bounds.max[2]+1]){
      point.set(layer.volume.coordinate(x,0),layer.volume.coordinate(y,1),layer.volume.coordinate(z,2)).applyMatrix4(matrix);
      point.toArray().forEach((v,i)=>{lo[i]=Math.min(lo[i],v);hi[i]=Math.max(hi[i],v);});
    }
    const {center,extent,resolution:n}=this.layout,h=2*extent/(n-1);
    const region={min:lo.map((v,i)=>Math.max(0,Math.floor((v-center[i]+extent)/h))) as Bounds['min'],max:hi.map((v,i)=>Math.min(n-1,Math.ceil((v-center[i]+extent)/h))) as Bounds['max']};
    // Coalesce overlapping edits to keep long strokes bounded, preserving distant regions.
    const overlap=this.regions.find(r=>r.min.every((v,i)=>v<=region.max[i]+1&&r.max[i]>=region.min[i]-1));
    if(overlap)for(let i=0;i<3;i++){overlap.min[i]=Math.min(overlap.min[i],region.min[i]);overlap.max[i]=Math.max(overlap.max[i],region.max[i]);}else this.regions.push(region);
    if(this.regions.length>64)this.full=true;
    this.version++;this.lastEdit=performance.now();
  }
  get failed():boolean {return this.failedVersion===this.version;}
  get busy():boolean{return !!this.running;}
  get trackedBytes():number{return (this.volume?this.volume.dimensions.reduce((a,b)=>a*b,1)*8:0)+(this.mesher?.ownedGeometryBytes??0);}
  get pending():boolean {return this.full||this.regions.length>0;}
  /** Debounced metadata/stroke preview. UI calls without awaiting; only one job can run. */
  tick():Promise<boolean>|null {this.syncMetadata();if(this.disposed||this.running||this.failedVersion===this.version||!this.pending||performance.now()-this.lastEdit<120)return null;return this.rebuild();}
  rebuild():Promise<boolean> {
    if(this.disposed)return Promise.resolve(false);this.syncMetadata();if(this.running)return this.running;
    this.running=this.build().catch(error=>{this.failedVersion=this.version;throw error;}).finally(()=>{this.running=null;});return this.running;
  }
  async flush():Promise<void> {this.syncMetadata();while(!this.disposed&&(this.running||this.pending)){await (this.running??this.rebuild());this.syncMetadata();}}
  private async build():Promise<boolean> {
    if(!this.pending)return false;
    const version=this.version,start=performance.now(),layout=compositeLayout(this.project.layerStack.compositionLayers,this.cap),key=JSON.stringify(layout),layoutChanged=key!==JSON.stringify(this.layout);
    const full=this.full||layoutChanged||!this.volume;
    if(layoutChanged||!this.volume){this.mesher?.dispose();this.surface?.clear();this.group.clear();this.volume=new SDFVolume(layout.resolution,layout.extent,false);this.mesher=new IncrementalMesher(this.volume);this.surface=new ChunkSurface(this.material);this.group.add(this.surface.group);this.group.position.fromArray(layout.center);this.layout=layout;}
    const volume=this.volume!,n=volume.resolution,evaluate=prepareComposite(this.project.layerStack.compositionLayers),regions=full?[{min:[0,0,0],max:[n-1,n-1,n-1]} as Bounds]:this.regions.map(r=>({min:[...r.min],max:[...r.max]} as Bounds));
    let samplingMs=0,samples=0;
    for(const region of regions)for(let z=region.min[2];z<=region.max[2];z++){
      const batch=performance.now(),wz=volume.coordinate(z)+layout.center[2];
      for(let y=region.min[1];y<=region.max[1];y++){const wy=volume.coordinate(y)+layout.center[1];for(let x=region.min[0];x<=region.max[0];x++){
        const value=evaluate(volume.coordinate(x)+layout.center[0],wy,wz);
        volume.values[volume.index(x,y,z)]=value;samples++;
      }}
      samplingMs+=performance.now()-batch;
      if(z%4===0){await yieldUI();if(this.disposed||version!==this.version){this.full=true;return false;}}
    }
    if(full)this.mesher!.invalidate();else regions.forEach(r=>this.mesher!.invalidate(r));
    let meshingMs=0,chunks=0,totalChunks=0,triangles=0;
    for(;;){const update=this.mesher!.rebuildChunks(8,3);if(!update)break;this.surface!.update(update.updates);meshingMs+=update.stats.milliseconds;chunks+=update.stats.chunks;totalChunks=update.stats.totalChunks;triangles=update.triangles;
      if(triangles>1_000_000){this.group.visible=false;throw new Error('Boolean preview exceeds 1,000,000 triangles. Reduce composite quality or source complexity.');}
      await yieldUI();if(this.disposed||version!==this.version){this.full=true;return false;}
    }
    this.full=false;this.regions=[];this.group.updateWorldMatrix(true,true);
    this.stats={samplingMs,meshingMs,elapsedMs:performance.now()-start,samples,chunks,totalChunks,triangles,resolution:n,step:volume.step,capped:layout.capped,full};return true;
  }
  exportSources():ExportSource[]{
    if(this.pending||!this.mesher||!this.volume||this.running)throw new Error('Wait for the Boolean result to finish rebuilding.');
    const mesher=this.mesher,version=this.version,volume=this.volume,metadata=this.metadataKey();
    return [{name:'Boolean Result',step:volume.step,transform:{position:this.group.position.toArray(),rotation:[0,0,0],scale:[1,1,1]},chunks:mesher.snapshotUpdates().filter(u=>u.geometry.getAttribute('position').count).map(u=>({positions:u.geometry.getAttribute('position').array as Float32Array,normals:u.geometry.getAttribute('normal').array as Float32Array})),current:()=>this.metadataKey()===metadata&&!this.disposed&&!this.pending&&!this.running&&this.version===version&&this.volume===volume}];
  }
  exportGroup():Group {
    if(this.pending||!this.surface)throw new Error('Wait for the Boolean preview to finish rebuilding.');
    const mesh=buildExportMesh(this.surface.group,this.exportMaterial,'local');mesh.geometry.applyMatrix4(this.group.matrix);if(!mesh.geometry.getAttribute('position').count){mesh.geometry.dispose();throw new Error('Boolean result is empty; no surface to export.');}
    const group=new Group();group.name=this.project.name;mesh.name='Boolean Result';group.add(mesh);return group;
  }
  dispose():void {this.disposed=true;this.version++;this.mesher?.dispose();this.surface?.clear();this.group.clear();this.mesher=null;this.surface=null;this.volume=null;this.layout=null;this.regions=[];}
}
