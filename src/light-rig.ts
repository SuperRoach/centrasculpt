import {Group,DirectionalLight,HemisphereLight,Object3D,Vector3,Matrix4,Ray,LineSegments,LineBasicMaterial,BufferGeometry,Float32BufferAttribute,Sphere,Quaternion,Mesh,MeshBasicMaterial,BoxGeometry,PlaneGeometry,EdgesGeometry,DoubleSide} from 'three';
import {LIGHT_IDS,defaultLighting,type LightingSettings,type LightId} from './lighting';
import type {XRControllerState} from './xr-input';
const HANDLE_COLOURS=['#ffd08a','#8ddcff','#e4b7ff'];
/** Reuses the original Key/Fill plus one permanent Rim slot: stable shader light count. */
export class LightRig{
 readonly root=new Group();readonly handles=new Group();readonly lights:DirectionalLight[];
 readonly inspection={enabled:false,paused:false,speed:6,direction:1,angle:0};
 editing=false;hover:LightId|null=null;selected:LightId|null=null;
 private original:{parent:Object3D|null;position:Vector3;target:Object3D;colour:number;intensity:number}[];
 private ambientIntensity:number;private saved?:LightingSettings;private lastTime:number|null=null;
 private icons:{group:Group;outline:LineSegments;doors:Group[];face:MeshBasicMaterial}[]=[];private guides:LineSegments[]=[];private resources:{dispose:()=>void}[]=[];
 private ray=new Ray();private sphere=new Sphere();private point=new Vector3();private world=new Vector3();private local=new Vector3();private inverse=new Matrix4();private controllerInverse=new Matrix4();
 private readonly attachment=new Matrix4();private readonly bodyPose=new Matrix4();private readonly basis=new Matrix4();private readonly rotation=new Quaternion();private readonly baseRotation=new Quaternion();private readonly scale=new Vector3();private readonly target=new Vector3();private readonly up=new Vector3(0,1,0);private targetDistance=1;
 private drag:LightId|null=null;private connection=-1;private armed=false;private ended=false;
 get active():boolean{return this.drag!==null;}
 constructor(private readonly settings:()=>LightingSettings|undefined,workspace:Group,key:DirectionalLight,fill:DirectionalLight,private readonly ambient:HemisphereLight,private readonly centre?:()=>Vector3){
 this.original=[key,fill].map(l=>({parent:l.parent,position:l.position.clone(),target:l.target,colour:l.color.getHex(),intensity:l.intensity}));this.ambientIntensity=ambient.intensity;
 this.lights=[key,fill,new DirectionalLight('#ffffff',0)];workspace.add(this.root);this.root.name='Lighting · display only';this.root.add(this.handles,this.lights[2],this.lights[2].target);
 for(let i=0;i<3;i++){
 // The front is local -Z, matching camera-style lookAt and the beam direction.
 const group=new Group();group.name=`${LIGHT_IDS[i]} studio light`;this.handles.add(group);
 const bodyGeometry=new BoxGeometry(.24,.18,.10),bodyMaterial=new MeshBasicMaterial({color:'#202830',depthTest:false,depthWrite:false,toneMapped:false}),body=new Mesh(bodyGeometry,bodyMaterial);body.position.z=.02;group.add(body);
 const geometry=new EdgesGeometry(bodyGeometry),material=new LineBasicMaterial({color:HANDLE_COLOURS[i],depthTest:false,depthWrite:false,toneMapped:false}),outline=new LineSegments(geometry,material);outline.position.z=.02;group.add(outline);
 const faceGeometry=new PlaneGeometry(.20,.14),face=new MeshBasicMaterial({color:'#fff4df',side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}),window=new Mesh(faceGeometry,face);window.position.z=-.031;group.add(window);
 const doorGeometry=new PlaneGeometry(.12,.12);doorGeometry.translate(0,.06,0);const doorMaterial=new MeshBasicMaterial({color:'#52606b',side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}),doors:Group[]=[];
 for(let side=0;side<4;side++){const hinge=new Group(),leaf=new Group();hinge.name=`Barn door ${side+1}`;hinge.rotation.z=side*Math.PI/2;hinge.position.set(side===1?-.12:side===3?.12:0,side===0?.09:side===2?-.09:0,-.035-side*.001);leaf.add(new Mesh(doorGeometry,doorMaterial),new LineSegments(new EdgesGeometry(doorGeometry),material));hinge.add(leaf);group.add(hinge);doors.push(leaf);this.resources.push((leaf.children[1] as LineSegments).geometry);}
 // One/two/three short marks identify Key/Fill/Rim without relying on colour.
 const marks:number[]=[];for(let n=0;n<=i;n++){const x=(n-i/2)*.045;marks.push(x,.115,.05,x,.16,.05);}const markGeometry=new BufferGeometry();markGeometry.setAttribute('position',new Float32BufferAttribute(marks,3));group.add(new LineSegments(markGeometry,material));
 group.traverse(o=>{o.renderOrder=o===body?900:o===window?901:o instanceof Mesh?902:903;o.raycast=()=>{};});this.icons.push({group,outline,doors,face});this.resources.push(bodyGeometry,bodyMaterial,geometry,material,faceGeometry,face,doorGeometry,doorMaterial,markGeometry);
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(new Float32Array(6),3));const m=new LineBasicMaterial({color:material.color,transparent:true,opacity:.25,depthWrite:false,toneMapped:false});const guide=new LineSegments(g,m);guide.raycast=()=>{};this.handles.add(guide);this.guides.push(guide);this.resources.push(g,m);
 }
 this.sync();
 }
 private targets=[new Object3D(),new Object3D()];
 private defaults=defaultLighting();
 get config():LightingSettings{return this.settings()??this.defaults;}
 preset():LightingSettings{const s=defaultLighting(),c=this.centre?.();if(c){c.clampScalar(-990,990);for(const id of LIGHT_IDS)for(let i=0;i<3;i++){s.lights[id].position[i]+=c.getComponent(i);s.lights[id].target[i]=c.getComponent(i);}}return s;}
 reset(id?:LightId):void{const s=this.config,d=this.preset();if(id)s.lights[id]=d.lights[id];else s.lights=d.lights;this.cancel();this.sync();}
 resetInspection():void{this.inspection.angle=0;this.lastTime=null;}
 stop():void{this.cancel();this.editing=false;this.inspection.enabled=false;this.lastTime=null;this.sync();}
 cancel():void{this.drag=null;this.armed=false;this.hover=null;}
 sync(time?:number,visible=true):void{
 if(this.ended)return;
 const s=this.config;if(this.saved!==s){this.cancel();this.editing=false;this.inspection.enabled=false;this.lastTime=null;this.saved=s;}
 const inspection=this.inspection;
 if(time!==undefined){const dt=this.lastTime===null?0:Math.max(0,Math.min(.1,(time-this.lastTime)/1000));this.lastTime=visible?time:null;if(visible&&inspection.enabled&&!inspection.paused)inspection.angle=(inspection.angle+dt*inspection.speed*Math.PI/180*inspection.direction)%(Math.PI*2);}
 const custom=s.enabled||inspection.enabled;
 this.ambient.intensity=custom?(inspection.enabled?.25:.65):this.ambientIntensity;
 for(let i=0;i<3;i++){
 const l=this.lights[i],p=s.lights[LIGHT_IDS[i]];
 if(custom){if(l.parent!==this.root)this.root.add(l);if(l.target===this.original[i]?.target)l.target=this.targets[i];if(l.target.parent!==this.root)this.root.add(l.target);
 l.position.fromArray(p.position);l.target.position.fromArray(p.target);l.color.set(p.colour);l.intensity=s.enabled&&p.enabled?p.intensity:0;
 if(inspection.enabled){l.intensity=i===0?3.4:0;if(i===0){const target=s.lights.key.target;l.target.position.fromArray(target);l.position.set(target[0]+Math.cos(inspection.angle)*3,target[1]+1.5,target[2]+Math.sin(inspection.angle)*3);l.color.set('#ffffff');}}
 }else if(i<2){const o=this.original[i];if(l.parent!==o.parent){l.target.removeFromParent();o.parent?.add(l);l.target=o.target;}l.position.copy(o.position);l.color.setHex(o.colour);l.intensity=o.intensity;}else l.intensity=0;
 const icon=this.icons[i];icon.group.position.fromArray(p.position);this.target.fromArray(p.target);this.basis.lookAt(icon.group.position,this.target,this.up);icon.group.quaternion.setFromRotationMatrix(this.basis);icon.group.rotateZ(p.roll??0);
 const on=p.enabled&&p.intensity>0;for(const door of icon.doors)door.rotation.x=on?-Math.PI/4:-Math.PI;icon.face.color.set(on?p.colour:'#171d24');
 (icon.outline.material as LineBasicMaterial).color.set(this.drag===LIGHT_IDS[i]?'#ffffff':this.hover===LIGHT_IDS[i]?'#a9ffbb':HANDLE_COLOURS[i]);icon.group.scale.setScalar(this.selected===LIGHT_IDS[i]?1.2:1);
 const a=this.guides[i].geometry.getAttribute('position');if(a.getX(0)!==Math.fround(p.position[0])||a.getY(0)!==Math.fround(p.position[1])||a.getZ(0)!==Math.fround(p.position[2])||a.getX(1)!==Math.fround(p.target[0])||a.getY(1)!==Math.fround(p.target[1])||a.getZ(1)!==Math.fround(p.target[2])){a.setXYZ(0,p.position[0],p.position[1],p.position[2]);a.setXYZ(1,p.target[0],p.target[1],p.target[2]);a.needsUpdate=true;this.guides[i].geometry.computeBoundingSphere();}
 }
 this.handles.visible=this.editing&&s.enabled&&!inspection.enabled;
 if(!this.handles.visible)this.cancel();
 }
 /** Explicit edit mode reserves Tool trigger through release, including misses. Grips stay navigation. */
 step(state:XRControllerState|undefined,pose:Matrix4|undefined,enabled:boolean,gripPose:Matrix4|undefined=pose):boolean{
 if(!this.editing||!this.config.enabled||this.inspection.enabled){this.cancel();return false;}
 if(!enabled||!state?.tracked||state.role!=='tool'||!state.gripTracked||!state.connected||!pose||!gripPose||![pose,gripPose].every(m=>m.elements.every(Number.isFinite)&&Math.abs(m.determinant())>1e-10)){this.cancel();return true;}
 if(this.connection!==state.connectionId){this.cancel();this.connection=state.connectionId;}
 this.root.updateWorldMatrix(true,false);this.inverse.copy(this.root.matrixWorld).invert();
 this.ray.origin.setFromMatrixPosition(pose);this.ray.direction.set(0,0,-1).transformDirection(pose);this.hover=null;let nearest=Infinity;
 for(let i=0;i<3;i++){this.world.fromArray(this.config.lights[LIGHT_IDS[i]].position).applyMatrix4(this.root.matrixWorld);this.sphere.set(this.world,.16*this.root.matrixWorld.getMaxScaleOnAxis());if(this.ray.intersectSphere(this.sphere,this.point)){const d=this.point.distanceTo(this.ray.origin);if(d<nearest&&d<3){nearest=d;this.hover=LIGHT_IDS[i];}}}
 const button=state.buttons.trigger;
 if(!button.pressed){this.drag=null;this.armed=true;return true;}
 if(button.justPressed&&this.armed&&this.hover){
 this.drag=this.hover;this.selected=this.drag;this.armed=false;const p=this.config.lights[this.drag];this.local.fromArray(p.position);this.target.fromArray(p.target);this.targetDistance=this.local.distanceTo(this.target);this.basis.lookAt(this.local,this.target,this.up);this.rotation.setFromRotationMatrix(this.basis);this.baseRotation.setFromAxisAngle(this.up.set(0,0,1),p.roll??0);this.up.set(0,1,0);this.rotation.multiply(this.baseRotation);this.bodyPose.compose(this.local,this.rotation,this.scale.set(1,1,1)).premultiply(this.root.matrixWorld);this.attachment.copy(gripPose).invert().multiply(this.bodyPose);
 }
 if(this.drag){
 this.bodyPose.multiplyMatrices(gripPose,this.attachment).premultiply(this.inverse);this.bodyPose.decompose(this.local,this.rotation,this.scale);this.target.set(0,0,-this.targetDistance).applyQuaternion(this.rotation).add(this.local);
 if([this.local,this.target].every(v=>v.toArray().every(n=>Number.isFinite(n)&&Math.abs(n)<=1000))&&this.local.distanceToSquared(this.target)>=.000001){const p=this.config.lights[this.drag];this.basis.lookAt(this.local,this.target,this.up);this.baseRotation.setFromRotationMatrix(this.basis).invert().multiply(this.rotation);const angle=2*Math.atan2(this.baseRotation.z,this.baseRotation.w),roll=Math.atan2(Math.sin(angle),Math.cos(angle));this.local.toArray(p.position);this.target.toArray(p.target);if(Math.abs(roll)>1e-10)p.roll=roll;else delete p.roll;}
 }

 return true;
 }
 dispose():void{if(this.ended)return;this.stop();for(let i=0;i<2;i++){const l=this.lights[i],o=this.original[i];l.target.removeFromParent();l.target=o.target;o.parent?.add(l);l.position.copy(o.position);l.color.setHex(o.colour);l.intensity=o.intensity;}this.ambient.intensity=this.ambientIntensity;this.ended=true;for(const resource of this.resources)resource.dispose();this.root.removeFromParent();}
}
