import { BufferGeometry, BufferAttribute, Group, Matrix3, Matrix4, Mesh, Vector3 } from 'three';
import type { Material } from 'three';
import type { ChunkUpdate } from './mesh';
import {ChunkSpatialIndex} from './chunk-spatial-index';

/** One draw mesh per nonempty chunk. Only updated chunks get new GPU attributes. */
export class ChunkSurface {
  readonly group = new Group();
  revision=0;
  readonly spatial=new ChunkSpatialIndex();
  private readonly meshes = new Map<number,Mesh>();
  constructor(private readonly material: Material) { this.group.name='SDF Sculpture'; }
  clear():void {this.group.clear();this.meshes.clear();this.spatial.clear();this.revision++;}
  update(updates: ChunkUpdate[]): void {
    if(updates.length)this.revision++;
    for(const {id,geometry} of updates) {
      let mesh=this.meshes.get(id);
      if(!geometry.getAttribute('position').count) {
        if(mesh) {this.group.remove(mesh);this.meshes.delete(id);}
        continue;
      }
      if(mesh) mesh.geometry=geometry;
      else {mesh=new Mesh(geometry,this.material);mesh.name=`Chunk ${id}`;this.meshes.set(id,mesh);this.group.add(mesh);}
    }
    if(updates.length)this.spatial.rebuild(this.meshes.values());
  }
}
/** Flatten every visible chunk into one world-space export mesh, including smooth normals. */
export function buildExportMesh(group: Group, material: Material, space: 'world'|'local'='world'): Mesh {
  group.updateWorldMatrix(true,true);
  const toExport=space==='local'?group.matrixWorld.clone().invert():new Matrix4();
  const chunks: Mesh[]=[];
  group.traverseVisible(object=>{if(object instanceof Mesh)chunks.push(object);});
  const count=chunks.reduce((sum,mesh)=>sum+mesh.geometry.getAttribute('position').count,0);
  const positions=new Float32Array(count*3),normals=new Float32Array(count*3);
  const point=new Vector3(),normal=new Vector3(),matrix=new Matrix3();let offset=0;
  for(const mesh of chunks) {
    const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal'),localMatrix=new Matrix4().multiplyMatrices(toExport,mesh.matrixWorld);matrix.getNormalMatrix(localMatrix);
    for(let i=0;i<p.count;i++) {
      point.fromBufferAttribute(p,i).applyMatrix4(localMatrix);normal.fromBufferAttribute(n,i).applyNormalMatrix(matrix);
      point.toArray(positions,offset);normal.toArray(normals,offset);offset+=3;
    }
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new BufferAttribute(positions,3));geometry.setAttribute('normal',new BufferAttribute(normals,3));
  const mesh=new Mesh(geometry,material);mesh.name='SDF Sculpture';return mesh;
}
