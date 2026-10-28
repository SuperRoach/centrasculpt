import {BufferAttribute,BufferGeometry,Group,Line,LineBasicMaterial,Matrix4,Mesh,MeshBasicMaterial,Raycaster,SphereGeometry,Vector3,DoubleSide} from 'three';
import {PreparedTube,simplifyTubePath,validateTube,type TubeSource} from './procedural-tube';
import {CLAY_TIP_REACH_METRES,filterClayPath,type PathPoint} from './clay-path';
import type {IndependentLayers} from './independent-layers';
import type {EditorToolState} from './editor-tool-state';
import type {XRStrokeInteraction} from './xr-clay-stroke';
import type {XRControllerState} from './xr-input';
/** All helpers are siblings of project geometry. Existing stroke routing owns
 * trigger/menu/grip/lifecycle cancellation, and the shared preview lock blocks edits. */
export class XRTubeTool implements XRStrokeInteraction{
 readonly preview=new Group();readonly guides=new Group();
 private readonly linePositions=new BufferAttribute(new Float32Array(8192*3),3);private readonly skinPositions=new BufferAttribute(new Float32Array(511*8*6*3),3);private readonly handles:Mesh[]=[];
 private readonly lineGeometry=new BufferGeometry();private readonly lineMaterial=new LineBasicMaterial({color:'#66ebdd',depthTest:false});
 private readonly line=new Line(this.lineGeometry,this.lineMaterial);
 private readonly handleGeometry=new SphereGeometry(.025,8,6);private readonly handleMaterial=new MeshBasicMaterial({color:'#fff0a3',depthTest:false});
 private readonly skinGeometry=new BufferGeometry();private readonly skinMaterial=new MeshBasicMaterial({color:'#66dfce',transparent:true,opacity:.55,side:DoubleSide,depthWrite:false});
 private readonly skin=new Mesh(this.skinGeometry,this.skinMaterial);
 private readonly ray=new Raycaster();private readonly anchor=new Matrix4();
 private held=false;private radiusHeld=false;private armed=false;private stickArmed=false;private owner=0;private project:unknown;private target='';private pointId='';private distance=.2;private offset=new Vector3();
 private raw:PathPoint[]=[];private draft:TubeSource|null=null;private pending:AbortController|null=null;private lastTime=0;private cacheKey='';private note='';private capturedMode='';private capturedLayers?:IndependentLayers;
 get active():boolean{return this.held||this.radiusHeld||!!this.pending;}
 get liveSizing():'tube-radius'|null{return this.held&&this.capturedMode==='tube'?'tube-radius':null;}
 get feedback():string{return this.pending?'Regenerating Tube · source preserved until ready':this.note;}
 constructor(private readonly layers:()=>IndependentLayers,private readonly tools:EditorToolState,root:Group,private readonly changed:()=>void=()=>{}){
  this.lineGeometry.setAttribute('position',this.linePositions);this.skinGeometry.setAttribute('position',this.skinPositions);this.preview.matrixAutoUpdate=false;this.preview.add(this.skin,this.line,this.guides);root.add(this.preview);this.preview.visible=false;
 }
 cancel():void{
  this.pending?.abort();this.pending=null;this.held=false;this.radiusHeld=false;this.armed=false;this.stickArmed=false;this.draft=null;this.raw=[];this.preview.visible=false;this.cacheKey='';this.release();
 }
 private release():void{this.capturedLayers?.endPreview(this);this.tools.endPreview(this);this.capturedLayers=undefined;}
 private acquire(l:IndependentLayers):void{this.tools.beginPreview(this);try{l.beginPreview(this);}catch(e){this.tools.endPreview(this);throw e;}this.capturedLayers=l;this.project=l.project;this.target=l.active.layer.id;this.capturedMode=this.tools.active;}
 private finish():void{
  const source=this.draft;if(!source){this.cancel();return;}const l=this.layers(),id=this.capturedMode==='edit-spline'?this.target:undefined;
  this.release();this.held=false;this.radiusHeld=false;const abort=new AbortController();this.pending=abort;
  void l.regenerateTube(source,id,abort.signal).then(()=>{if(this.pending!==abort)return;this.note='Tube ready · Edit Spline to reshape';this.changed();}).catch(error=>{if(this.pending===abort)this.note=error instanceof Error?error.message:String(error);}).finally(()=>{if(this.pending===abort){this.pending=null;this.draft=null;this.preview.visible=false;this.cacheKey='';}});
 }
 private paint(source:TubeSource,matrix:Matrix4,handles:boolean):void{
  const key=JSON.stringify([source,handles,this.tools.splinePointId]);this.preview.visible=true;this.preview.matrix.copy(matrix);if(this.preview.parent){this.preview.parent.updateWorldMatrix(true,false);this.preview.matrix.premultiply(this.preview.parent.matrixWorld.clone().invert());}this.preview.updateWorldMatrix(false,true);if(key===this.cacheKey)return;this.cacheKey=key;
  const p=new PreparedTube(source,.04),samples=p.samples;samples.forEach((s,i)=>this.linePositions.setXYZ(i,s.p.x,s.p.y,s.p.z));this.linePositions.needsUpdate=true;this.lineGeometry.setDrawRange(0,samples.length);this.line.frustumCulled=false;
  // Bounded 8-sided radius preview; final surface always comes from the SDF cache.
  const count=Math.min(512,samples.length);let vertexCount=0;const rings:Vector3[][]=[];
  for(let j=0;j<count;j++){const i=Math.round(j*(samples.length-1)/(count-1)),s=samples[i],t=samples[Math.min(samples.length-1,i+1)].p.clone().sub(samples[Math.max(0,i-1)].p).normalize();if(t.lengthSq()<1e-10)t.set(1,0,0);const u=new Vector3().crossVectors(t,Math.abs(t.y)<.9?new Vector3(0,1,0):new Vector3(0,0,1)).normalize(),v=new Vector3().crossVectors(t,u);rings.push(Array.from({length:8},(_,k)=>s.p.clone().addScaledVector(u,Math.cos(k*Math.PI/4)*s.r).addScaledVector(v,Math.sin(k*Math.PI/4)*s.r)));}
  for(let j=1;j<count;j++)for(let k=0;k<8;k++){const a=rings[j-1][k],b=rings[j-1][(k+1)%8],c=rings[j][k],d=rings[j][(k+1)%8];for(const p of [a,c,b,b,c,d])this.skinPositions.setXYZ(vertexCount++,p.x,p.y,p.z);}
  this.skinPositions.needsUpdate=true;this.skinGeometry.setDrawRange(0,vertexCount);this.skin.frustumCulled=false;
  for(const h of this.handles)h.visible=false;if(handles)source.points.forEach((point,i)=>{let mesh=this.handles[i];if(!mesh){mesh=new Mesh(this.handleGeometry,this.handleMaterial);this.handles.push(mesh);this.guides.add(mesh);}mesh.visible=true;mesh.position.fromArray(point.position);mesh.scale.setScalar(point.id===this.tools.splinePointId?1.5:1);mesh.userData.pointId=point.id;mesh.renderOrder=1000;});this.preview.updateWorldMatrix(false,true);
 }
 private selectSurface():void{
  const l=this.layers(),hit=this.ray.intersectObjects(l.group.children,true).find(h=>{let o=h.object;while(o.parent&&o.parent!==l.group)o=o.parent;const id=o.userData.layerId;return id&&l.project.layerStack.get(id).procedural;});
  if(hit){let o=hit.object;while(o.parent&&o.parent!==l.group)o=o.parent;l.select(o.userData.layerId);this.tools.splinePointId=null;this.cacheKey='';this.changed();}
 }
 update(tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void{
  const mode=this.tools.active,l=this.layers(),dt=this.lastTime?Math.min(.05,Math.max(0,(time-this.lastTime)/1000)):0,gap=this.lastTime?time-this.lastTime:0;this.lastTime=time;
  if(!Number.isFinite(time)||!enabled||mode!=='tube'&&mode!=='edit-spline'||!tool?.connected||!tool.tracked||!tool.gripTracked||tool.role!=='tool'||!pose||!pose.elements.every(Number.isFinite)||Math.abs(pose.determinant())<1e-10){this.cancel();return;}
  if(this.active&&(this.project!==l.project||this.owner!==tool.connectionId||this.capturedMode!==mode||this.target!==l.project.activeLayerId||gap>1000)){this.cancel();return;}
  if(this.pending)return;
  const surface=mode==='tube'?l.group:l.active.surface.group;surface.updateWorldMatrix(true,true);
  if((this.held||this.radiusHeld)&&this.anchor.elements.some((v,i)=>Math.abs(v-surface.matrixWorld.elements[i])>1e-9)){this.cancel();return;}
  try{
   this.ray.ray.origin.setFromMatrixPosition(pose);this.ray.ray.direction.set(0,0,-1).transformDirection(pose);this.ray.far=3;
   if(!tool.buttons.trigger.pressed)this.armed=true;
   const pressed=tool.buttons.trigger.justPressed&&tool.buttons.trigger.pressed&&this.armed;
   if(mode==='tube'){
    if(pressed&&!this.held&&!this.tools.busy){this.acquire(l);this.anchor.copy(surface.matrixWorld);this.owner=tool.connectionId;this.held=true;this.armed=false;this.raw=[];this.note='Drawing Tube · release to finish';}
    if(this.held){const matrix=gripPose??pose,p=new Vector3(0,0,-CLAY_TIP_REACH_METRES).applyMatrix4(matrix).applyMatrix4(this.anchor.clone().invert()),radius=this.tools.brushRadius,previous=this.raw.at(-1);
     const spacing=Math.max(l.active.volume.step,radius*.25);if(!previous||p.distanceTo(new Vector3(previous.x,previous.y,previous.z))>=spacing||!tool.buttons.trigger.pressed){this.raw.push({x:p.x,y:p.y,z:p.z,t:time/1000,radius});if(this.raw.length>256)throw new Error('Tube reached 256 points; draw a shorter path.');}
     if(this.raw.length>=2){const filtered=filterClayPath(this.raw,this.tools.path.steady,radius,this.tools.path.straightLine),path=simplifyTubePath(filtered,l.active.volume.step*.35),final=this.tools.path.straightLine?[path[0],path.at(-1)!]:path;if(final.length>256)throw new Error('Tube exceeds 256 control points after smoothing.');this.draft={kind:'tube',closed:false,interpolation:this.tools.path.straightLine?'linear':'centripetal',points:final.map((p,i)=>({id:`draw-${i}`,position:[p.x,p.y,p.z],radius:p.radius??radius}))};this.paint(this.draft,this.anchor,false);}
     if(!tool.buttons.trigger.pressed)this.finish();
    }else this.preview.visible=false;return;
   }
   let source=this.draft??l.active.layer.procedural;
   if(!source){this.preview.visible=false;if(pressed&&!this.tools.busy)this.selectSurface();return;}
   if(!l.active.layer.editable){this.cancel();return;}
   if(!this.tools.splinePointId||!source.points.some(p=>p.id===this.tools.splinePointId))this.tools.splinePointId=source.points[0].id;
   this.paint(source,this.held||this.radiusHeld?this.anchor:surface.matrixWorld,true);
   if(pressed&&!this.held&&!this.radiusHeld&&!this.tools.busy){const hit=this.ray.intersectObjects(this.guides.children).find(h=>h.object.visible);if(hit){this.tools.splinePointId=hit.object.userData.pointId;this.pointId=this.tools.splinePointId!;this.acquire(l);this.anchor.copy(surface.matrixWorld);this.owner=tool.connectionId;this.draft=validateTube(source);this.distance=hit.distance;this.offset.copy(new Vector3(...source.points.find(p=>p.id===this.pointId)!.position)).sub(this.ray.ray.at(this.distance,new Vector3()).applyMatrix4(this.anchor.clone().invert()));this.held=true;this.armed=false;}else this.selectSurface();}
   const stick=tool.stick.available&&Number.isFinite(tool.stick.y)&&Number.isFinite(tool.stick.x)?tool.stick.y:0;if(Math.abs(stick)<.12)this.stickArmed=true;
   if(this.stickArmed&&Math.abs(stick)>.18&&Math.abs(tool.stick.x)<Math.abs(stick)*.75&&(this.held||!this.tools.busy)){
    if(!this.held&&!this.radiusHeld){this.acquire(l);this.anchor.copy(surface.matrixWorld);this.owner=tool.connectionId;this.draft=validateTube(source);this.pointId=this.tools.splinePointId!;this.radiusHeld=true;}
    const point=this.draft!.points.find(p=>p.id===this.pointId)!;point.radius=Math.max(.005,Math.min(2,point.radius*Math.exp(-stick*dt)));this.note=`Point radius ${point.radius.toFixed(3)}`;
   }
   if(this.held){const point=this.draft!.points.find(p=>p.id===this.pointId)!,p=this.ray.ray.at(this.distance,new Vector3()).applyMatrix4(this.anchor.clone().invert()).add(this.offset);point.position=p.toArray();if(!tool.buttons.trigger.pressed)this.finish();}
   else if(this.radiusHeld&&Math.abs(stick)<.12)this.finish();
   if(this.draft)this.paint(this.draft,this.anchor,true);
  }catch(error){this.cancel();this.note=error instanceof Error?error.message:'Tube cancelled';}
 }
 dispose():void{this.cancel();this.preview.removeFromParent();this.skinGeometry.dispose();this.skinMaterial.dispose();this.lineGeometry.dispose();this.lineMaterial.dispose();this.handleGeometry.dispose();this.handleMaterial.dispose();}
}
