import {SDFVolume} from './sdf';
import {assertExactDenseGrowth} from './dense-growth';
import { BufferGeometry, BufferAttribute } from 'three';
import type { VolumeStore } from './volume-store';
import type { Bounds } from './sdf';
type Point = [number, number, number] & { normal?: [number, number, number] };
const corners: Point[] = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
// A consistent body diagonal gives matching triangulation on neighboring cube faces.
const tetrahedra = [[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
/** Marching tetrahedra extracts the zero isosurface independently of rendering/UI. */
function extractRegion(volume: VolumeStore, bounds: Bounds): { positions: number[]; normals: number[] } {
  const positions: number[] = [], normals: number[] = [];
  const dense=volume.getDenseView(),zeroTolerance=volume.step*Number.EPSILON*32;
  // Read every inclusive sample once before allocating per-cell intersections.
  // No cached occupancy: trusted replay and direct dense writes remain valid.
  let negative=false, exterior=false;
  occupancy: for(let z=bounds.min[2];z<=bounds.max[2];z++)for(let y=bounds.min[1];y<=bounds.max[1];y++)for(let x=bounds.min[0];x<=bounds.max[0];x++){
    const id=volume.index(x,y,z),v=dense?dense[id]:volume.readVoxel(id);
    if(v < -zeroTolerance)negative=true;else exterior=true;
    if(negative&&exterior)break occupancy;
  }
  if(!negative||!exterior)return {positions,normals};
  const values=new Array<number>(8);
  function triangle(a: Point, b: Point, c: Point, outward: Point): void {
    const ab = b.map((v, i) => v - a[i]);
    const ac = c.map((v, i) => v - a[i]);
    const normal = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
    // Exact-zero lattice intersections can collapse a tetrahedron to a line or
    // point. Do not publish zero-area primitives (picking/export/reconstruction).
    if (Math.hypot(...normal) <= volume.step * volume.step * 1e-12) return;
    const vertices = normal.reduce((s,v,i) => s + v*outward[i], 0) < 0 ? [a,c,b] : [a,b,c];
    for (const vertex of vertices) { positions.push(...vertex); normals.push(...(vertex.normal ??= volume.normalAt(vertex))); }
  }
  for (let z=bounds.min[2]; z<bounds.max[2]; z++) for (let y=bounds.min[1]; y<bounds.max[1]; y++) for (let x=bounds.min[0]; x<bounds.max[0]; x++) {
    // Treat only machine-roundoff distances as zero, consistently in every cell.
    // Analytic planar SDFs can otherwise disagree in sign at an exact face.
    for(let i=0;i<8;i++){const c=corners[i],index=volume.index(x+c[0],y+c[1],z+c[2]);values[i]=dense?dense[index]:volume.readVoxel(index);}
    // Most cells in a thin sculpt are empty: keep that fast path free of
    // tolerance work and edge/gradient allocations.
    if (values.every(v => v >= 0)) continue;
    for(let i=0;i<8;i++) if(Math.abs(values[i])<=zeroTolerance) values[i]=0;
    if (values.every(v => v >= 0) || values.every(v => v < 0)) continue;
    const points: Point[] = corners.map(c => [volume.coordinate(x+c[0],0),volume.coordinate(y+c[1],1),volume.coordinate(z+c[2],2)]);
    // Corner order follows global linear sample order, so either cell sharing
    // an edge performs precisely the same arithmetic, regardless of tet winding.
    const indices=corners.map(c=>volume.index(x+c[0],y+c[1],z+c[2]));
    const edges: (Point | undefined)[] = new Array(64);
    const edge = (a: number,b: number): Point => {
      if(indices[a]>indices[b]) [a,b]=[b,a];
      const key=a*8+b;
      if(edges[key]) return edges[key]!;
      const t = values[a] / (values[a]-values[b]);
      return edges[key] = t===0 ? points[a] : t===1 ? points[b] : points[a].map((v,i) => v + t*(points[b][i]-v)) as Point;
    };
    for (const tet of tetrahedra) {
      const inside = tet.filter(i => values[i] < 0), outside = tet.filter(i => values[i] >= 0);
      if (!inside.length || !outside.length) continue;
      const direction = points[outside[0]].map((v,i) => v-points[inside[0]][i]) as Point;
      if (inside.length === 1) triangle(edge(inside[0],outside[0]), edge(inside[0],outside[1]), edge(inside[0],outside[2]), direction);
      else if (outside.length === 1) triangle(edge(outside[0],inside[0]), edge(outside[0],inside[1]), edge(outside[0],inside[2]), direction);
      else {
        const a=edge(inside[0],outside[0]), b=edge(inside[0],outside[1]), c=edge(inside[1],outside[0]), d=edge(inside[1],outside[1]);
        triangle(a,b,c,direction); triangle(b,d,c,direction);
      }
    }
  }
  return {positions, normals};
}
function geometryFromRegions(regions: Iterable<{positions: number[]; normals: number[]}>): BufferGeometry {
  const all = Array.from(regions);
  const count = all.reduce((sum, region) => sum + region.positions.length, 0);
  const positions = new Float32Array(count), normals = new Float32Array(count);
  let offset = 0;
  for (const region of all) { positions.set(region.positions, offset); normals.set(region.normals, offset); offset += region.positions.length; }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions,3));
  geometry.setAttribute('normal', new BufferAttribute(normals,3));
  geometry.computeBoundingSphere();
  return geometry;
}
export function extractMesh(volume: VolumeStore): BufferGeometry {
  return geometryFromRegions([extractRegion(volume, {min:[0,0,0],max:volume.dimensions.map(n=>n-1) as Point})]);
}
export type RebuildStats = { milliseconds: number; chunks: number; totalChunks: number; rebuilds: number; averageMilliseconds: number };
export type ChunkUpdate = { id: number; bounds: Bounds; geometry: BufferGeometry };
/** Chunks own disjoint cells and read one global grid, including their gradient halo.
 * Geometry belongs to the mesher; consumers retain unchanged geometry by identity.
 */
type MeshChunk={key:string;bounds:Bounds;geometry:BufferGeometry|null};
type ChunkLayout={chunks:MeshChunk[];lookup:Int32Array;min:Point;max:Point;size:Point;origin:Point;dimensions:Point};
export class IncrementalMesher {
  private chunks:MeshChunk[]=[];
  private dirty=new Set<number>();
  private borrowed=new Set<BufferGeometry>();
  private ownedBytes=0;
  get ownedGeometryBytes():number{return this.ownedBytes;}
  private bytes(g:BufferGeometry):number{let n=0;for(const a of Object.values(g.attributes))n+=a.array.byteLength;return n+(g.index?.array.byteLength??0);}
  private layout:ChunkLayout;
  private disposed=false;private editRevision=0;
  private triangleCount=0;private rebuilds=0;private totalMilliseconds=0;
  constructor(private volume:VolumeStore,private readonly chunkSize=16){
    if(!Number.isInteger(chunkSize)||chunkSize<1)throw new Error('Invalid chunk size');
    this.layout=this.buildLayout(volume);this.chunks=this.layout.chunks;this.invalidate();
  }
  private buildLayout(volume:VolumeStore,reuse:MeshChunk[]=[]):ChunkLayout{
    const origin=volume.latticeMin??[0,0,0],dims=volume.dimensions,min=origin.map(v=>Math.floor(v/this.chunkSize)) as Point,max=origin.map((v,a)=>Math.ceil((v+dims[a]-1)/this.chunkSize)-1) as Point,size=min.map((v,a)=>max[a]-v+1) as Point;
    const chunks=reuse.map(c=>({...c})),ids=new Map(chunks.map((c,id)=>[c.key,id])),lookup=new Int32Array(size[0]*size[1]*size[2]);
    for(let z=min[2];z<=max[2];z++)for(let y=min[1];y<=max[1];y++)for(let x=min[0];x<=max[0];x++){
      const key=`${x},${y},${z}`,cell=[x,y,z],bounds={min:cell.map((v,a)=>Math.max(0,v*this.chunkSize-origin[a])) as Point,max:cell.map((v,a)=>Math.min(dims[a]-1,(v+1)*this.chunkSize-origin[a])) as Point};
      let id=ids.get(key);if(id===undefined){id=chunks.length;ids.set(key,id);chunks.push({key,bounds,geometry:null});}else chunks[id].bounds=bounds;
      lookup[x-min[0]+size[0]*(y-min[1]+size[1]*(z-min[2]))]=id;
    }
    return {chunks,lookup,min,max,size,origin:[...origin] as Point,dimensions:[...dims] as Point};
  }
  private idAt(x:number,y:number,z:number):number{const {min,size,lookup}=this.layout;return lookup[x-min[0]+size[0]*(y-min[1]+size[1]*(z-min[2]))];}
  get pendingChunks():number{return this.dirty.size;}
  get allocatedChunks():number{return this.chunks.length;}
  chunkKey(id:number):string{return this.chunks[id]?.key??'';}
  /** The editor coordinates this staged rebind with source/history publication.
   * Validation and layout allocations precede publication; old geometry is retained.
   * No resampling, layer metadata edit or disposal of unchanged buffers. */
  rebindVolume(next:SDFVolume){return this.prepareRebindVolume(next)();}
  prepareRebindVolume(next:SDFVolume):()=>{reusedChunks:number;addedChunks:number;dirtyChunks:number;validationMs:number}{
    const start=performance.now();if(this.disposed)throw new Error('Mesher is disposed.');
    if(!(this.volume instanceof SDFVolume))throw new Error('Dense growth requires a dense lattice source.');
    if(next===this.volume)return ()=>({reusedChunks:this.chunks.length,addedChunks:0,dirtyChunks:this.dirty.size,validationMs:performance.now()-start});
    assertExactDenseGrowth(this.volume,next);
    const oldCount=this.chunks.length,oldBounds=this.volume.bounds,newBounds=next.bounds,layout=this.buildLayout(next,this.chunks),dirty=new Set(this.dirty);
    for(let id=0;id<layout.chunks.length;id++){
      const chunk=layout.chunks[id];
      if(id<oldCount){
        // Only occupied old boundary chunks can observe changed gradient halos.
        const p=chunk.geometry?.getAttribute('position');let affected=false;
        if(p)for(let i=0;i<p.count&&!affected;i++)for(let a=0;a<3;a++){
          const coordinate=a===0?p.getX(i):a===1?p.getY(i):p.getZ(i);
          if(newBounds.min[a]<oldBounds.min[a]&&coordinate<=oldBounds.min[a]+2*next.step||newBounds.max[a]>oldBounds.max[a]&&coordinate>=oldBounds.max[a]-2*next.step){affected=true;break;}
        }
        if(affected)dirty.add(id);
      }else{
        // New positive capacity has no surface. Avoid extraction and even empty
        // geometry allocation; edits later invalidate these stable chunk IDs.
        const {min,max}=chunk.bounds;let occupied=false;
        for(let z=min[2];z<=max[2]&&!occupied;z++)for(let y=min[1];y<=max[1]&&!occupied;y++)for(let x=min[0];x<=max[0];x++)if(next.values[next.index(x,y,z)]<0){occupied=true;break;}
        if(occupied)dirty.add(id);
      }
    }
    const source=this.volume,revision=this.editRevision;let used=false;
    return ()=>{if(used||this.disposed||this.editRevision!==revision||this.volume!==source)throw new Error('Stale mesher growth preparation.');assertExactDenseGrowth(source as SDFVolume,next);used=true;this.editRevision++;this.volume=next;this.layout=layout;this.chunks=layout.chunks;this.dirty=dirty;
      return {reusedChunks:oldCount,addedChunks:this.chunks.length-oldCount,dirtyChunks:dirty.size,validationMs:performance.now()-start};};
  }
  invalidate(bounds?:Bounds|null):void{this.editRevision++;
    if(bounds===null)return;if(!bounds){this.chunks.forEach((_,id)=>this.dirty.add(id));return;}
    this.visitAffected(bounds,id=>this.dirty.add(id));
  }
  private visitAffected(bounds:Bounds,visit:(id:number)=>void):void{
    const origin=this.layout.origin,lo=bounds.min.map((v,a)=>Math.max(this.layout.min[a],Math.floor((v+origin[a]-2)/this.chunkSize))),hi=bounds.max.map((v,a)=>Math.min(this.layout.max[a],Math.floor((v+origin[a]+1)/this.chunkSize)));
    for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++)visit(this.idAt(x,y,z));
  }
  invalidateSample(index:number,signChanged:boolean):void{this.editRevision++;
    const [nx,ny]=this.layout.dimensions,p=[index%nx,Math.floor(index/nx)%ny,Math.floor(index/(nx*ny))] as Point;
    this.visitAffected({min:p,max:p},id=>{if(signChanged||(this.chunks[id].geometry?.getAttribute('position').count??0)>0)this.dirty.add(id);});
  }
  /** Coalesce identical chunk/gradient-halo coverage during a staged stamp patch.
   * A rebuild or any outside invalidation clears the cache, so later writes still
   * dirty geometry extracted between publication slices. Clay keeps its API. */
  stampInvalidator():(index:number,signChanged:boolean)=>void{
    const layout=this.layout,visited=new Set<number>();let revision=this.editRevision;
    return (index,signChanged)=>{
      if(this.layout!==layout||this.disposed)throw new Error('Stamp mesher changed during publication.');
      if(revision!==this.editRevision)visited.clear();
      const [nx,ny]=layout.dimensions,x=index%nx,y=Math.floor(index/nx)%ny,z=Math.floor(index/(nx*ny)),c=this.chunkSize;
      const lx=Math.max(layout.min[0],Math.floor((x+layout.origin[0]-2)/c)),ly=Math.max(layout.min[1],Math.floor((y+layout.origin[1]-2)/c)),lz=Math.max(layout.min[2],Math.floor((z+layout.origin[2]-2)/c));
      const hx=Math.min(layout.max[0],Math.floor((x+layout.origin[0]+1)/c)),hy=Math.min(layout.max[1],Math.floor((y+layout.origin[1]+1)/c)),hz=Math.min(layout.max[2],Math.floor((z+layout.origin[2]+1)/c));
      const cell=(lx-layout.min[0])+layout.size[0]*((ly-layout.min[1])+layout.size[1]*(lz-layout.min[2]));
      const key=cell*16+(hx>lx?2:0)+(hy>ly?4:0)+(hz>lz?8:0)+Number(signChanged);
      if(!visited.has(key)){this.invalidateSample(index,signChanged);visited.add(key);}revision=this.editRevision;
    };
  }
  rebuildChunks(maxChunks=Infinity,maxMilliseconds=Infinity):{updates:ChunkUpdate[];stats:RebuildStats;triangles:number}|null{
    if(!(maxChunks>0)||!(maxMilliseconds>=0))throw new Error('Invalid meshing batch budget.');
    if(this.disposed)throw new Error('Mesher is disposed.');
    if(!this.dirty.size)return null;this.editRevision++;const start=performance.now(),updates:ChunkUpdate[]=[];
    for(const id of this.dirty){if(updates.length>=maxChunks||(updates.length>0&&performance.now()-start>=maxMilliseconds))break;const chunk=this.chunks[id],geometry=geometryFromRegions([extractRegion(this.volume,chunk.bounds)]);
      this.triangleCount+=(geometry.getAttribute('position').count-(chunk.geometry?.getAttribute('position').count??0))/3;
      if(chunk.geometry){if(!this.borrowed.delete(chunk.geometry)){this.ownedBytes-=this.bytes(chunk.geometry);chunk.geometry.dispose();}}chunk.geometry=geometry;this.ownedBytes+=this.bytes(geometry);updates.push({id,bounds:chunk.bounds,geometry});this.dirty.delete(id);
    }
    const milliseconds=performance.now()-start;this.rebuilds++;this.totalMilliseconds+=milliseconds;
    return {updates,triangles:this.triangleCount,stats:{milliseconds,chunks:updates.length,totalChunks:this.chunks.length,rebuilds:this.rebuilds,averageMilliseconds:this.totalMilliseconds/this.rebuilds}};
  }
  /** Isolated edit branch: retain unchanged chunk buffers, remesh only the patch.
   * Borrowed buffers stay owned by the source until successful publication. */
  forkEdit(next:SDFVolume,bounds:Bounds):IncrementalMesher{
    if(this.disposed||this.dirty.size)throw new Error('Finish source meshing before Move.');
    if(next.step!==this.volume.step)throw new Error('Move cannot resample source spacing.');
    const fork=new IncrementalMesher(next,this.chunkSize);fork.layout=fork.buildLayout(next,this.chunks);fork.chunks=fork.layout.chunks;fork.dirty.clear();fork.triangleCount=this.triangleCount;
    for(const chunk of fork.chunks)if(chunk.geometry)fork.borrowed.add(chunk.geometry);
    fork.invalidate(bounds);
    const before=this.volume.bounds,after=next.bounds;
    for(let id=0;id<this.chunks.length;id++){const g=this.chunks[id].geometry;if(!g?.getAttribute('position').count)continue;if(!g.boundingBox)g.computeBoundingBox();const box=g.boundingBox!;for(let a=0;a<3;a++){if(after.min[a]<before.min[a]&&box.min.getComponent(a)<=before.min[a]+2*next.step||after.max[a]>before.max[a]&&box.max.getComponent(a)>=before.max[a]-2*next.step){fork.dirty.add(id);break;}}}
    return fork;
  }
  snapshotUpdates():ChunkUpdate[]{return this.chunks.flatMap((c,id)=>c.geometry?[{id,bounds:c.bounds,geometry:c.geometry}]:[]);}
  get triangles():number{return this.triangleCount;}
  /** Preallocate ownership transfer; caller revalidates locks/source before invoking. */
  prepareAdoptionFrom(source:IncrementalMesher):()=>void{const shared=new Set(source.borrowed),empty=new Set<BufferGeometry>();let adoptedBytes=0;for(const g of this.borrowed){shared.add(g);adoptedBytes+=this.bytes(g);}const total=this.ownedBytes+adoptedBytes;return ()=>{source.borrowed=shared;source.ownedBytes-=adoptedBytes;this.borrowed=empty;this.ownedBytes=total;};}
  rebuild():{geometry:BufferGeometry;stats:RebuildStats}|null{
    const result=this.rebuildChunks();if(!result)return null;
    const regions=this.chunks.filter(c=>c.geometry).map(c=>({positions:Array.from(c.geometry!.getAttribute('position').array),normals:Array.from(c.geometry!.getAttribute('normal').array)}));
    return {geometry:geometryFromRegions(regions),stats:result.stats};
  }
  dispose():void{if(this.disposed)return;this.disposed=true;for(const c of this.chunks)if(c.geometry&&!this.borrowed.has(c.geometry))c.geometry.dispose();this.borrowed.clear();this.dirty.clear();this.chunks=[];this.layout.chunks=[];this.layout.lookup=new Int32Array(0);this.triangleCount=0;this.ownedBytes=0;}
}
