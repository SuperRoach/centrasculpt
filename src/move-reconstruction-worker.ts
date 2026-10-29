import {BufferAttribute,BufferGeometry,Group,Mesh,Vector3} from 'three';
import {sculptMask} from './sculpt-mask';
import {SDFVolume} from './sdf';
import {RadialMoveField} from './move-field';
import {MoveWork,reconstructMove} from './deformation-reconstruction';
// One private snapshot per worker; termination is cancellation, never publication.
self.onmessage=async ({data:d})=>{
 try{
  const group=new Group();for(const positions of d.positions){const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(positions,3));group.add(new Mesh(geometry));}
  let first=true;const volume=new SDFVolume(d.resolution,d.extent,false,d.layout,n=>{if(first){first=false;return d.values;}return new Float32Array(n);});
  if(d.mask)sculptMask(volume).restore(d.mask);
  const f=d.field,field=new RadialMoveField();field.capture(new Vector3(...f.center),f.radius,f.falloff,1);field.configure(f.mode,f.stiffness);field.setDisplacement(new Vector3(...f.delta));field.interaction=f.interaction;field.setRotation(new Vector3(...f.axis),f.angle);
  let lastProgress=0,lastStage='';
  const result=await reconstructMove(group,volume,field,new MoveWork(new AbortController().signal,()=>true),d.maxBytes,p=>{const now=performance.now();if(p.stage!==lastStage||p.completed===p.total||now-lastProgress>=32){lastStage=p.stage;lastProgress=now;self.postMessage({id:d.id,progress:p});}});
  self.postMessage({id:d.id,result}, {transfer:[result.patch.indices.buffer,result.patch.before.buffer,result.patch.after.buffer]});
 }catch(error){self.postMessage({id:d.id,error:error instanceof Error?error.message:String(error)});}
};
