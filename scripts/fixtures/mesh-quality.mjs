import {SDFVolume} from '../../work/test-build/sdf.mjs';
import {preparePrimitive} from '../../work/test-build/shape-library.mjs';
export function qualityVolume(n,kind){
 const volume=new SDFVolume(n,1.6,false);
 const primitive=preparePrimitive(['sphere','box','triangular-prism','pyramid'].includes(kind)?kind:'box',kind==='sphere'?[1.7,1.7,1.7]:[1.4,1.4,1.4]);
 const field=p=>{
  if(kind==='thin-stroke')return Math.hypot(p.y,p.z)-.065+Math.max(0,Math.abs(p.x)-.65);
  if(kind==='narrow-groove')return Math.max(primitive.sampleLocal(p),-Math.hypot(p.x,p.z-.7)+.065);
  if(kind==='aligned-box')return Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))-.8;
  return primitive.sampleLocal(p);
 };
 const [nx,ny,nz]=volume.dimensions;
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)volume.values[volume.index(x,y,z)]=field({x:volume.coordinate(x),y:volume.coordinate(y),z:volume.coordinate(z)});
 return {volume,field};
}
export function qualityMetrics(geometries,field,step,sphere=false){
 let vertices=0,degenerate=0,maxError=0,sumError2=0,maxNormalDegrees=0,maxSeamNormalDelta=0,shared=0;
 const welded=new Map();
 for(const g of geometries){const p=g.getAttribute('position'),n=g.getAttribute('normal');
  for(let i=0;i<p.count;i+=3){const a=[],b=[],c=[];for(let k=0;k<3;k++){a.push(p.array[i*3+k]);b.push(p.array[(i+1)*3+k]);c.push(p.array[(i+2)*3+k]);}
   const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<=step*step*1e-12)degenerate++;
   const center=a.map((v,k)=>(v+b[k]+c[k])/3);maxError=Math.max(maxError,Math.abs(field({x:center[0],y:center[1],z:center[2]})));
  }
  for(let i=0;i<p.count;i++){const point=[p.getX(i),p.getY(i),p.getZ(i)],normal=[n.getX(i),n.getY(i),n.getZ(i)],error=Math.abs(field({x:point[0],y:point[1],z:point[2]}));vertices++;sumError2+=error*error;maxError=Math.max(maxError,error);
   const key=point.map(v=>(Math.abs(v)<.5e-7?0:v).toFixed(7)).join(','),old=welded.get(key);if(old){shared++;maxSeamNormalDelta=Math.max(maxSeamNormalDelta,Math.hypot(...normal.map((v,k)=>v-old[k])));}else welded.set(key,normal);
   if(sphere){const length=Math.hypot(...point),dot=point.reduce((s,v,k)=>s+v/length*normal[k],0);maxNormalDegrees=Math.max(maxNormalDegrees,Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI);}
  }
 }
 return {vertices,triangles:vertices/3,degenerate,maxSurfaceProbeError:maxError,maxSurfaceProbeErrorVoxels:maxError/step,vertexRmsError:Math.sqrt(sumError2/Math.max(1,vertices)),maxNormalDegrees:sphere?maxNormalDegrees:null,maxSeamNormalDelta,shared};
}
