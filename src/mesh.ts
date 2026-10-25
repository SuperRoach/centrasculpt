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
    const points: Point[] = corners.map(c => [volume.coordinate(x+c[0]),volume.coordinate(y+c[1]),volume.coordinate(z+c[2])]);
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
  const n = volume.resolution - 1;
  return geometryFromRegions([extractRegion(volume, {min:[0,0,0],max:[n,n,n]})]);
}
export type RebuildStats = { milliseconds: number; chunks: number; totalChunks: number; rebuilds: number; averageMilliseconds: number };
export type ChunkUpdate = { id: number; bounds: Bounds; geometry: BufferGeometry };
/** Chunks own disjoint cells and read one global grid, including their gradient halo.
 * Geometry belongs to the mesher; consumers retain unchanged geometry by identity.
 */
export class IncrementalMesher {
  private readonly chunks: {bounds: Bounds; geometry: BufferGeometry | null}[] = [];
  private readonly dirty = new Set<number>();
  private readonly axisChunks: number;
  private rebuilds = 0;
  private totalMilliseconds = 0;
  constructor(private readonly volume: VolumeStore, private readonly chunkSize = 16) {
    if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('Invalid chunk size');
    const n = volume.resolution - 1;
    this.axisChunks=Math.ceil(n/chunkSize);
    for (let z=0;z<n;z+=chunkSize) for (let y=0;y<n;y+=chunkSize) for (let x=0;x<n;x+=chunkSize) {
      this.chunks.push({bounds:{min:[x,y,z],max:[Math.min(x+chunkSize,n),Math.min(y+chunkSize,n),Math.min(z+chunkSize,n)]},geometry:null});
    }
    this.invalidate();
  }
  get pendingChunks():number{return this.dirty.size;}
  invalidate(bounds?: Bounds | null): void {
    if (bounds === null) return;
    if (!bounds) {this.chunks.forEach((_,id)=>this.dirty.add(id));return;}
    // Changed sample k affects surface cells k-2 through k+1 through gradient interpolation.
    const lo=bounds.min.map(v=>Math.max(0,Math.floor((v-2)/this.chunkSize)));
    const hi=bounds.max.map(v=>Math.min(this.axisChunks-1,Math.floor((v+1)/this.chunkSize)));
    for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++)this.dirty.add(x+this.axisChunks*(y+this.axisChunks*z));
  }
  /** Exact far-field stamp changes need geometry work only where an existing surface
   * reads the sample, or where a sign change may introduce/remove a surface. */
  invalidateSample(index:number,signChanged:boolean):void {
    const n=this.volume.resolution,x=index%n,y=Math.floor(index/n)%n,z=Math.floor(index/(n*n));
    const lo=[x,y,z].map(v=>Math.max(0,Math.floor((v-2)/this.chunkSize))),hi=[x,y,z].map(v=>Math.min(this.axisChunks-1,Math.floor((v+1)/this.chunkSize)));
    for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
      const id=x+this.axisChunks*(y+this.axisChunks*z);
      if(signChanged||(this.chunks[id].geometry?.getAttribute('position').count??0)>0)this.dirty.add(id);
    }
  }
  rebuildChunks(maxChunks=Infinity): {updates: ChunkUpdate[]; stats: RebuildStats; triangles: number} | null {
    if (!this.dirty.size) return null;
    const start=performance.now(), updates: ChunkUpdate[]=[];
    for(const id of [...this.dirty].slice(0,maxChunks)) {
      const chunk=this.chunks[id];
      const geometry=geometryFromRegions([extractRegion(this.volume,chunk.bounds)]);
      chunk.geometry?.dispose(); chunk.geometry=geometry;
      updates.push({id,bounds:chunk.bounds,geometry});this.dirty.delete(id);
    }
    const milliseconds=performance.now()-start;
    this.rebuilds++;this.totalMilliseconds+=milliseconds;
    return {updates,triangles:this.chunks.reduce((sum,c)=>sum+(c.geometry?.getAttribute('position').count ?? 0)/3,0),stats:{milliseconds,chunks:updates.length,totalChunks:this.chunks.length,rebuilds:this.rebuilds,averageMilliseconds:this.totalMilliseconds/this.rebuilds}};
  }
  /** Compatibility/reference path for tests. The renderer uses rebuildChunks exclusively. */
  rebuild(): {geometry: BufferGeometry; stats: RebuildStats} | null {
    const result=this.rebuildChunks();
    if (!result) return null;
    const regions=this.chunks.map(c=>({positions:Array.from(c.geometry!.getAttribute('position').array),normals:Array.from(c.geometry!.getAttribute('normal').array)}));
    return {geometry:geometryFromRegions(regions),stats:result.stats};
  }
  dispose(): void { for(const chunk of this.chunks)chunk.geometry?.dispose();this.dirty.clear(); }
}
