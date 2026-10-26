import {Matrix4,Mesh,MeshStandardMaterial,Sphere,Vector3} from 'three';
import type {Group,Material,BufferGeometry} from 'three';
import type {ChunkSpatialIndex} from './chunk-spatial-index';
import {RadialMoveField} from './move-field';
export const MOVE_PREPARATION_BUDGET_MS=12;
const identity=new Matrix4();
/** GLSL mirrors both modes of RadialMoveField. Source attributes are NEVER written or uploaded.
 * The same layer-local function on duplicate boundary vertices prevents seams. */
export const MOVE_PREVIEW_GLSL=`
uniform vec3 moveCenter;
uniform vec3 moveDelta;
uniform float moveRadius;
uniform float moveExponent;
uniform float moveElastic;
uniform float moveStiffness;
float moveWeight(vec3 p) {float q=dot(p-moveCenter,p-moveCenter)/(moveRadius*moveRadius);return pow(max(0.0,1.0-q),moveExponent);}
vec3 moveGradient(vec3 p) {float q=dot(p-moveCenter,p-moveCenter)/(moveRadius*moveRadius);return q>=1.0?vec3(0.0):-2.0*moveExponent*pow(max(0.0,1.0-q),moveExponent-1.0)*(p-moveCenter)/(moveRadius*moveRadius);}
vec3 elasticMove(vec3 p, int column) {
 vec3 r=p-moveCenter;float q=dot(r,r)/(moveRadius*moveRadius);if(q>=1.0)return vec3(0.0);
 float e=moveRadius/3.0,iv=inversesqrt(dot(r,r)+e*e),iv3=iv*iv*iv,iv5=iv3*iv*iv;
 float t=pow(1.0-q,moveExponent)/moveStiffness,A=e*(0.5*iv+0.5*e*e*iv3),B=0.5*e*iv3,h=dot(r,moveDelta);
 if(column<0)return t*(A*moveDelta+B*r*h);
 float rj=r[column],dj=moveDelta[column],dt=-2.0*moveExponent*rj/(moveRadius*moveRadius)*pow(1.0-q,moveExponent-1.0)/moveStiffness;
 float dA=e*(-0.5*iv3-1.5*e*e*iv5)*rj,dB=-1.5*e*iv5*rj;
 vec3 v=(dA*t+A*dt)*moveDelta+((dB*t+B*dt)*h+B*t*dj)*r;v[column]+=B*t*h;return v;
}
vec3 moveNormal(vec3 p,vec3 n) {
 if(moveElastic<0.5){vec3 g=moveGradient(p);return (1.0+dot(g,moveDelta))*n-g*dot(moveDelta,n);}
 vec3 a=vec3(1,0,0)+elasticMove(p,0),b=vec3(0,1,0)+elasticMove(p,1),c=vec3(0,0,1)+elasticMove(p,2);
 return cross(b,c)*n.x+cross(c,a)*n.y+cross(a,b)*n.z;
}

`;
type Binding={mesh:Mesh;material:Material|Material[];preview:MeshStandardMaterial;culled:boolean;geometry:BufferGeometry};
export class MoveMeshPreview {
 readonly field=new RadialMoveField();
 affectedVertices=0;candidateVertices=0;affectedChunks=0;preparationMs=0;
 private bindings:Binding[]=[];
 private readonly materials=new Map<MeshStandardMaterial,MeshStandardMaterial>();
 private readonly influence=new Sphere();
 private readonly candidates:Mesh[]=[];
 readonly uniforms={moveCenter:{value:this.field.center},moveDelta:{value:this.field.delta},moveRadius:{value:.3},moveExponent:{value:3},moveElastic:{value:0},moveStiffness:{value:1}};
 get active():boolean{return this.bindings.length>0;}
 get cachedMaterials():number{return this.materials.size;}
 begin(surface:Group,center:Vector3,radius:number,falloff:number,strength:number,budgetMs=MOVE_PREPARATION_BUDGET_MS,index?:ChunkSpatialIndex,mode:'non-elastic'|'elastic'='non-elastic',stiffness=1):void{
  this.restore();this.field.capture(center,radius,falloff,strength);this.field.configure(mode,stiffness);this.uniforms.moveElastic.value=mode==='elastic'?1:0;this.uniforms.moveStiffness.value=stiffness;this.uniforms.moveRadius.value=radius;this.uniforms.moveExponent.value=falloff+1;
  const start=performance.now(),chosen:{mesh:Mesh;material:MeshStandardMaterial}[]=[];let candidates=0,affected=0;
  this.influence.center.copy(center);this.influence.radius=radius;
  try{
   if(index)index.sphere(this.influence,this.candidates);
   for(const object of index?this.candidates:surface.children){if(!(object instanceof Mesh)||!object.visible)continue;const mesh=object,p=mesh.geometry.getAttribute('position');if(!p?.count)continue;
    mesh.updateMatrix();if(!mesh.matrix.equals(identity))throw new Error('Move requires layer-local chunk geometry.');
    // Chunk extraction already builds bounding spheres; no SDF reads or full remesh.
    const sphere=mesh.geometry.boundingSphere;if(sphere&&!sphere.intersectsSphere(this.influence))continue;
    candidates+=p.count;
    if(!(mesh.material instanceof MeshStandardMaterial))throw new Error('Move preview requires the existing sculpt material.');
    let count=0;const r2=radius*radius;for(let i=0;i<p.count;i++){const x=p.getX(i)-center.x,y=p.getY(i)-center.y,z=p.getZ(i)-center.z;if(x*x+y*y+z*z<r2)count++;}
    if(performance.now()-start>budgetMs)throw new Error('Move preparation took too long · reduce radius or scene detail and retry.');
    if(count){affected+=count;chosen.push({mesh,material:mesh.material});}
   }
   if(!affected)throw new Error('No vertices inside Move influence · increase radius.');
   const staged=chosen.map(({mesh,material})=>{
    let preview=this.materials.get(material);
    if(!preview){preview=material.clone();preview.name='Experimental Move preview · render only';
     preview.onBeforeCompile=shader=>{Object.assign(shader.uniforms,this.uniforms);shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+MOVE_PREVIEW_GLSL).replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>\nvec3 moveN=moveNormal(position,objectNormal);\nobjectNormal=dot(moveN,moveN)>1e-12?normalize(moveN):objectNormal;`).replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed += moveElastic>0.5?elasticMove(position,-1):moveDelta*moveWeight(position);');};
     preview.customProgramCacheKey=()=> 'centra-move-preview-v3-elastic';this.materials.set(material,preview);
    }
    return {mesh,material:mesh.material,preview,culled:mesh.frustumCulled,geometry:mesh.geometry};
   });
   // Publish only after all validation/scans/material allocation succeeded.
   this.bindings=staged;for(const b of staged){b.mesh.material=b.preview;b.mesh.frustumCulled=false;}
   this.candidateVertices=candidates;this.affectedVertices=affected;this.affectedChunks=staged.length;
  }catch(error){this.cancel();throw error;}finally{this.candidates.length=0;this.preparationMs=performance.now()-start;}
 }
 valid():boolean{for(const b of this.bindings)if(b.mesh.geometry!==b.geometry||b.mesh.material!==b.preview)return false;return true;}
 update(displacement:Vector3):void{this.field.setDisplacement(displacement);}
 /** Release restores exact material references/culling; cached shader clones can
  * be reused on the next grab. Tool/session cancellation releases that cache. */
 restore():void{for(const b of this.bindings){b.mesh.material=b.material;b.mesh.frustumCulled=b.culled;}this.bindings=[];this.field.delta.set(0,0,0);}
 cancel():void{this.restore();for(const m of this.materials.values())m.dispose();this.materials.clear();this.affectedVertices=this.candidateVertices=this.affectedChunks=0;}
 dispose():void{this.cancel();}
}
