import {Box3,Mesh,Ray,Sphere,Vector3} from 'three';
type Entry={mesh:Mesh;box:Box3};
type Node={box:Box3;left?:Node;right?:Node;entries?:Entry[]};
/** Layer-local BVH over existing chunk bounds, rebuilt at mesh publication only.
 * Queries write into caller-owned arrays and never inspect vertex attributes. */
export class ChunkSpatialIndex {
 private root:Node|undefined;
 chunks=0;nodes=0;revision=0;lastVisited=0;
 private readonly point=new Vector3();
 rebuild(meshes:Iterable<Mesh>):void{
  const entries:Entry[]=[];
  for(const mesh of meshes){const g=mesh.geometry;if(!g.boundingBox)g.computeBoundingBox();if(g.boundingBox&&!g.boundingBox.isEmpty())entries.push({mesh,box:g.boundingBox.clone()});}
  this.chunks=entries.length;this.nodes=0;this.root=this.build(entries);this.revision++;
 }
 private build(entries:Entry[]):Node|undefined{
  if(!entries.length)return;this.nodes++;const box=new Box3();for(const e of entries)box.union(e.box);
  if(entries.length<=4)return {box,entries};
  const size=box.getSize(new Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
  entries.sort((a,b)=>(a.box.min[axis]+a.box.max[axis])-(b.box.min[axis]+b.box.max[axis]));const mid=entries.length>>1;
  return {box,left:this.build(entries.slice(0,mid)),right:this.build(entries.slice(mid))};
 }
 sphere(sphere:Sphere,out:Mesh[]):void{out.length=0;this.lastVisited=0;this.sphereNode(this.root,sphere,out);}
 private sphereNode(n:Node|undefined,s:Sphere,out:Mesh[]):void{if(!n)return;this.lastVisited++;if(!n.box.intersectsSphere(s))return;if(n.entries){for(const e of n.entries)if(e.mesh.visible&&e.box.intersectsSphere(s))out.push(e.mesh);}else{this.sphereNode(n.left,s,out);this.sphereNode(n.right,s,out);}}
 ray(ray:Ray,out:Mesh[]):void{out.length=0;this.lastVisited=0;this.rayNode(this.root,ray,out);}
 private rayNode(n:Node|undefined,r:Ray,out:Mesh[]):void{if(!n)return;this.lastVisited++;if(!r.intersectBox(n.box,this.point))return;if(n.entries){for(const e of n.entries)if(e.mesh.visible&&r.intersectBox(e.box,this.point))out.push(e.mesh);}else{this.rayNode(n.left,r,out);this.rayNode(n.right,r,out);}}
 clear():void{this.root=undefined;this.chunks=this.nodes=0;this.revision++;}
}
