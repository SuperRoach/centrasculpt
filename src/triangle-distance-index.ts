import {Ray,Triangle,Vector3} from 'three';
/** Immutable deformed triangle soup, Morton-ordered BVH. Owned compact arrays;
 * nearest-distance and oriented-crossing queries reuse fixed traversal/intersection storage. */
export class TriangleDistanceIndex {
 private order:Uint32Array;private boxes:Float32Array;private leafBase=1;
 private readonly stack=new Int32Array(64);private readonly triangle=new Triangle();
 private readonly closest=new Vector3();private readonly hit=new Vector3();
 private readonly ray=new Ray(new Vector3(),new Vector3(.932173,.341129,.119713).normalize());
 private readonly crossings:number[]=[];private readonly bary=new Vector3();private readonly faceNormal=new Vector3();
 private readonly directions=[new Vector3(.932173,.341129,.119713).normalize(),new Vector3(-.217731,.871337,.439129).normalize(),new Vector3(.381713,-.231119,.895713).normalize()];
 nearestChanged=false;nearestTriangle=-1;distance=0;
 private readonly query=new Vector3();private top=0;private best=Infinity;private epsilon=1e-8;private phase:'nearest'|'parity'|'done'='done';private attempt=0;private ambiguous=false;
 private constructor(readonly positions:Float32Array,readonly changed:Uint8Array,order:Uint32Array,boxes:Float32Array,leafBase:number){this.order=order;this.boxes=boxes;this.leafBase=leafBase;}
 static async build(positions:Float32Array,changed:Uint8Array,pause:()=>Promise<void>):Promise<TriangleDistanceIndex>{
  const count=positions.length/9;if(!Number.isInteger(count)||!count||changed.length!==count)throw new Error('Move needs valid closed source triangles.');
  let order=new Uint32Array(count),scratch=new Uint32Array(count),codes=new Uint32Array(count),codeScratch=new Uint32Array(count);
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i++){const a=i%3,v=positions[i];if(!Number.isFinite(v))throw new Error('Move produced nonfinite triangles.');lo[a]=Math.min(lo[a],v);hi[a]=Math.max(hi[a],v);if(i%18432===18431)await pause();}
  const spread=(n:number)=>{n=(n|(n<<16))&0x030000ff;n=(n|(n<<8))&0x0300f00f;n=(n|(n<<4))&0x030c30c3;return (n|(n<<2))&0x09249249;};
  for(let i=0;i<count;i++){let code=0;for(let a=0;a<3;a++){const c=(positions[i*9+a]+positions[i*9+3+a]+positions[i*9+6+a])/3,q=Math.max(0,Math.min(1023,Math.floor((c-lo[a])/Math.max(1e-20,hi[a]-lo[a])*1023)));code|=spread(q)<<a;}codes[i]=code;order[i]=i;if(i%2048===2047)await pause();}
  const bins=new Uint32Array(256);for(let shift=0;shift<32;shift+=8){bins.fill(0);for(let i=0;i<count;i++){bins[(codes[i]>>>shift)&255]++;if(i%4096===4095)await pause();}let offset=0;for(let b=0;b<256;b++){const n=bins[b];bins[b]=offset;offset+=n;}for(let i=0;i<count;i++){const at=bins[(codes[i]>>>shift)&255]++;scratch[at]=order[i];codeScratch[at]=codes[i];if(i%4096===4095)await pause();}[order,scratch]=[scratch,order];[codes,codeScratch]=[codeScratch,codes];}
  let leafBase=1;while(leafBase<Math.ceil(count/8))leafBase*=2;const boxes=new Float32Array(leafBase*2*6);
  for(let node=leafBase;node<leafBase*2;node++){const b=node*6;for(let a=0;a<3;a++){boxes[b+a]=Infinity;boxes[b+3+a]=-Infinity;}const end=Math.min(count,(node-leafBase+1)*8);for(let j=(node-leafBase)*8;j<end;j++){const t=order[j]*9;for(let v=0;v<3;v++)for(let a=0;a<3;a++){boxes[b+a]=Math.min(boxes[b+a],positions[t+v*3+a]);boxes[b+3+a]=Math.max(boxes[b+3+a],positions[t+v*3+a]);}}if(node%512===511)await pause();}
  for(let node=leafBase-1;node>=1;node--){const b=node*6,l=node*12,r=l+6;for(let a=0;a<3;a++){boxes[b+a]=Math.min(boxes[l+a],boxes[r+a]);boxes[b+3+a]=Math.max(boxes[l+3+a],boxes[r+3+a]);}if(node%2048===0)await pause();}
  return new TriangleDistanceIndex(positions,changed,order,boxes,leafBase);
 }
 get bytes():number{return this.positions.byteLength+this.changed.byteLength+this.order.byteLength+this.boxes.byteLength;}
 private setTriangle(id:number):void{const i=id*9,p=this.positions;this.triangle.a.fromArray(p,i);this.triangle.b.fromArray(p,i+3);this.triangle.c.fromArray(p,i+6);}
 private distanceBox(node:number,p:Vector3):number{const b=node*6,a=this.boxes;let d=0;for(let k=0;k<3;k++){const v=p.getComponent(k),q=Math.max(a[b+k]-v,0,v-a[b+3+k]);d+=q*q;}return d;}
 private rayBox(node:number):boolean{const a=this.boxes,b=node*6;if(a[b]>a[b+3])return false;const o=this.ray.origin,d=this.ray.direction;let near=0,far=Infinity;for(let k=0;k<3;k++){const x=(a[b+k]-o.getComponent(k))/d.getComponent(k),y=(a[b+3+k]-o.getComponent(k))/d.getComponent(k);near=Math.max(near,Math.min(x,y));far=Math.min(far,Math.max(x,y));if(near>far)return false;}return true;}
 beginQuery(p:Vector3,epsilon:number):void{this.query.copy(p);this.epsilon=epsilon;this.top=1;this.stack[0]=1;this.best=Infinity;this.nearestTriangle=-1;this.nearestChanged=false;this.phase='nearest';this.attempt=0;}
 /** Bounded traversal; call again after yielding when false. No per-step arrays. */
 stepQuery(maxNodes=64):boolean{
  let visited=0;const p=this.query;
  while(this.phase!=='done'&&visited<maxNodes){
   if(this.top){const node=this.stack[--this.top];visited++;
    if(this.phase==='nearest'){
     if(this.distanceBox(node,p)>this.best)continue;
     if(node>=this.leafBase){const end=Math.min(this.order.length,(node-this.leafBase+1)*8);for(let j=(node-this.leafBase)*8;j<end;j++){const id=this.order[j];this.setTriangle(id);this.triangle.closestPointToPoint(p,this.closest);const d=this.closest.distanceToSquared(p);if(d<this.best){this.best=d;this.nearestTriangle=id;}}}
     else{const l=node*2,r=l+1;if(this.distanceBox(l,p)<this.distanceBox(r,p)){this.stack[this.top++]=r;this.stack[this.top++]=l;}else{this.stack[this.top++]=l;this.stack[this.top++]=r;}}
    }else{
     if(!this.rayBox(node))continue;
     if(node>=this.leafBase){const end=Math.min(this.order.length,(node-this.leafBase+1)*8);for(let j=(node-this.leafBase)*8;j<end;j++){this.setTriangle(this.order[j]);if(this.ray.intersectTriangle(this.triangle.a,this.triangle.b,this.triangle.c,false,this.hit)){const distance=this.hit.distanceTo(p);if(distance>this.epsilon){this.triangle.getBarycoord(this.hit,this.bary);if(Math.min(this.bary.x,this.bary.y,this.bary.z)<1e-7)this.ambiguous=true;this.triangle.getNormal(this.faceNormal);const sign=this.faceNormal.dot(this.ray.direction);if(Math.abs(sign)<1e-9)this.ambiguous=true;this.crossings.push(sign<0?-distance:distance);}}}}
     else{this.stack[this.top++]=node*2;this.stack[this.top++]=node*2+1;}
    }
   }else if(this.phase==='nearest'){
    if(!Number.isFinite(this.best))throw new Error('Move source contains no usable triangles.');this.nearestChanged=this.nearestTriangle>=0&&!!this.changed[this.nearestTriangle];
    if(this.best<=this.epsilon*this.epsilon){this.distance=0;this.phase='done';return true;}
    this.phase='parity';this.startRay();
   }else{
    this.crossings.sort((a,b)=>Math.abs(a)-Math.abs(b));for(let i=1;i<this.crossings.length;i++)if(Math.abs(this.crossings[i])-Math.abs(this.crossings[i-1])<=this.epsilon)this.ambiguous=true;
    if(!this.ambiguous){let winding=0;for(const hit of this.crossings)winding+=hit>0?1:-1;this.distance=Math.sqrt(this.best)*(winding!==0?-1:1);this.phase='done';return true;}
    if(++this.attempt>=this.directions.length)throw new Error('Move sign is ambiguous near a folded/degenerate surface. Reduce the pull and retry.');this.startRay();
   }
  }
  return this.phase==='done';
 }
 private startRay():void{this.ray.origin.copy(this.query);this.ray.direction.copy(this.directions[this.attempt]);this.crossings.length=0;this.ambiguous=false;this.top=1;this.stack[0]=1;}
 signedDistance(p:Vector3,epsilon:number):number{this.beginQuery(p,epsilon);while(!this.stepQuery()){}return this.distance;}
}
