import {BufferAttribute,BufferGeometry,Group,Mesh,MeshStandardMaterial} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {exportAdmission,ExportWork,optimiseExportMesh} from './export-mesh';
import type {ExportSource,ExportQuality,ExportMeshStats} from './export-mesh';
export type GlbExportResult={data:ArrayBuffer;stats:ExportMeshStats[];milliseconds:number;estimatedBytes:number;geometryBytes:number;backend:'worker'|'cooperative'};
/** Entire preparation and GLB packing run in a browser Worker in the application. */
export async function encodeExport(sources:ExportSource[],quality:ExportQuality,maxBytes:number,work=new ExportWork()):Promise<GlbExportResult>{
 const start=performance.now(),admission=exportAdmission(sources,quality,maxBytes),group=new Group(),material=new MeshStandardMaterial({color:'#afbd94',roughness:.68,metalness:.03}),paintMaterial=new MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.68,metalness:.03}),stats:ExportMeshStats[]=[];let geometryBytes=0;
 group.name='Centra Sculpt';
 try{
  for(let i=0;i<sources.length;i++){
   const result=await optimiseExportMesh(sources[i],quality,work);if(!result.stats.triangles)continue;
   const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(result.positions,3));geometry.setAttribute('normal',new BufferAttribute(result.normals,3));if(result.colours)geometry.setAttribute('color',new BufferAttribute(result.colours,3));if(result.indices)geometry.setIndex(new BufferAttribute(result.indices,1));
   geometryBytes+=result.positions.byteLength+result.normals.byteLength+(result.colours?.byteLength??0)+(result.indices?.byteLength??0);
   const mesh=new Mesh(geometry,result.colours?paintMaterial:material),t=result.transform;mesh.name=result.name;if(result.layerId)mesh.userData.layerId=result.layerId;mesh.position.fromArray(t.position);mesh.rotation.set(...t.rotation,'XYZ');mesh.scale.fromArray(t.scale);group.add(mesh);stats.push(result.stats);await work.pause('Preparing GLB',i+1,sources.length);
  }
  if(!group.children.length)throw new Error('No valid triangles to export.');work.check();work.progress({stage:'Packing GLB',completed:0,total:1});
  const data=await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true});work.check();if(!(data instanceof ArrayBuffer))throw new Error('GLB encoder returned invalid data.');if(data.byteLength>maxBytes)throw new Error('GLB exceeds the export memory limit. Export fewer layers.');
  return {data,stats,milliseconds:performance.now()-start,estimatedBytes:admission.estimatedBytes,geometryBytes,backend:'cooperative'};
 }finally{for(const mesh of group.children)if(mesh instanceof Mesh)mesh.geometry.dispose();material.dispose();paintMaterial.dispose();}
}
