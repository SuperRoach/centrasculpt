import {SDFVolume} from './sdf';
import {assertExactDenseGrowth} from './dense-growth';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { VolumeStore } from './volume-store';
import type { Bounds } from './sdf';
type Point = [number, number, number];
const corners: Point[] = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
// A consistent body diagonal gives matching triangulation on neighboring cube faces.
const tetrahedra = [[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
/** Marching tetrahedra extracts the zero isosurface independently of rendering/UI. */
function extractRegion(volume: VolumeStore, bounds: Bounds): { positions: number[]; normals: number[] } {
  const positions: number[] = [], normals: number[] = [];
  const dense=volume.getDenseView();
  function triangle(a: Point, b: Point, c: Point, outward: Point): void {
    const ab = b.map((v, i) => v - a[i]);
    const ac = c.map((v, i) => v - a[i]);
    const normal = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
    const vertices = normal.reduce((s,v,i) => s + v*outward[i], 0) < 0 ? [a,c,b] : [a,b,c];
    for (const vertex of vertices) { positions.push(...vertex); normals.push(...volume.normalAt(vertex)); }
  }
  for (let z=bounds.min[2]; z<bounds.max[2]; z++) for (let y=bounds.min[1]; y<bounds.max[1]; y++) for (let x=bounds.min[0]; x<bounds.max[0]; x++) {
    const values = corners.map(c => {const index=volume.index(x+c[0],y+c[1],z+c[2]);return dense?dense[index]:volume.readVoxel(index);});
    if (values.every(v => v >= 0) || values.every(v => v < 0)) continue;
    const points: Point[] = corners.map(c => [volume.coordinate(x+c[0],0),volume.coordinate(y+c[1],1),volume.coordinate(z+c[2],2)]);
    const edge = (a: number,b: number): Point => {
      const t = values[a] / (values[a]-values[b]);
      return points[a].map((v,i) => v + t*(points[b][i]-v)) as Point;
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
  geometry.setAttribute('position', new Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals,3));
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
  rebuildChunks(maxChunks=Infinity):{updates:ChunkUpdate[];stats:RebuildStats;triangles:number}|null{
    if(!this.dirty.size)return null;this.editRevision++;const start=performance.now(),updates:ChunkUpdate[]=[];
    for(const id of this.dirty){if(updates.length>=maxChunks)break;const chunk=this.chunks[id],geometry=geometryFromRegions([extractRegion(this.volume,chunk.bounds)]);
      this.triangleCount+=(geometry.getAttribute('position').count-(chunk.geometry?.getAttribute('position').count??0))/3;
      chunk.geometry?.dispose();chunk.geometry=geometry;updates.push({id,bounds:chunk.bounds,geometry});this.dirty.delete(id);
    }
    const milliseconds=performance.now()-start;this.rebuilds++;this.totalMilliseconds+=milliseconds;
    return {updates,triangles:this.triangleCount,stats:{milliseconds,chunks:updates.length,totalChunks:this.chunks.length,rebuilds:this.rebuilds,averageMilliseconds:this.totalMilliseconds/this.rebuilds}};
  }
  rebuild():{geometry:BufferGeometry;stats:RebuildStats}|null{
    const result=this.rebuildChunks();if(!result)return null;
    const regions=this.chunks.filter(c=>c.geometry).map(c=>({positions:Array.from(c.geometry!.getAttribute('position').array),normals:Array.from(c.geometry!.getAttribute('normal').array)}));
    return {geometry:geometryFromRegions(regions),stats:result.stats};
  }
  dispose():void{if(this.disposed)return;this.disposed=true;for(const c of this.chunks)c.geometry?.dispose();this.dirty.clear();}
}
