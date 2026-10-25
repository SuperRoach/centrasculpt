import type {Point3} from './sdf';
export type PathPoint=Point3&{t:number};
export const CLAY_TIP_REACH_METRES=.12;
export class ClayPathControls {steady=0;straightLine=false;placement:'free'|'surface'='free';}
const lerp=(a:PathPoint,b:PathPoint,u:number):PathPoint=>({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u,t:a.t+(b.t-a.t)*u});
const distance=(a:Point3,b:Point3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
/** Spatially uniform, nonnegative local averaging: smooth the trajectory, never the SDF.
 * Zero is an exact identity; straight segments take precedence. Endpoints are pinned.
 * The bounded spatial support scales with brush radius, not controller frame delta. */
export function filterClayPath(raw:readonly PathPoint[],steady:number,radius:number,straightLine=false):readonly PathPoint[]{
 if(!Number.isFinite(steady)||steady<0||steady>100||!Number.isFinite(radius)||radius<=0)throw new Error('Invalid Steady parameters.');
 if(raw.length>8192||raw.some((p,i)=>![p.x,p.y,p.z,p.t].every(Number.isFinite)||p.t<0||i>0&&p.t<raw[i-1].t))throw new Error('Invalid or oversized Clay trajectory.');
 if(raw.length<2)return raw;
 if(straightLine){const start=raw[0],end=raw.at(-1)!,duration=end.t-start.t;return raw.map((p,i)=>({...lerp(start,end,duration>0?(p.t-start.t)/duration:i/(raw.length-1)),t:p.t}));}
 if(steady===0)return raw;
 const arc=[0];for(let i=1;i<raw.length;i++)arc.push(arc[i-1]+distance(raw[i],raw[i-1]));
 const total=arc.at(-1)!;if(total<1e-12)return raw;
 const count=Math.ceil(total/(radius*.05));if(count>16382)throw new Error('Clay path exceeds the spatial sample budget.');
 const samples:PathPoint[]=[],positions:number[]=[];let segment=1;
 for(let i=0;i<=count;i++){
  const s=Math.min(total,i*total/count);while(segment<raw.length-1&&arc[segment]<s)segment++;
  const length=arc[segment]-arc[segment-1],u=length>0?(s-arc[segment-1])/length:0;samples.push(lerp(raw[segment-1],raw[segment],u));positions.push(s);
 }
 samples[0]={...raw[0]};samples[samples.length-1]={...raw.at(-1)!};
 const amount=steady/100,window=radius*(.05+.6*amount),output:PathPoint[]=[];
 let left=0,right=0;
 for(let i=0;i<samples.length;i++){
  while(positions[i]-positions[left]>window)left++;while(right+1<samples.length&&positions[right+1]-positions[i]<=window)right++;
  let x=0,y=0,z=0,weight=0;
  for(let j=left;j<=right;j++){const d=(positions[j]-positions[i])/window,w=Math.exp(-4*d*d);x+=samples[j].x*w;y+=samples[j].y*w;z+=samples[j].z*w;weight+=w;}
  const blend=amount*Math.min(1,positions[i]/window,(total-positions[i])/window),p=samples[i];
  output.push({x:p.x+(x/weight-p.x)*blend,y:p.y+(y/weight-p.y)*blend,z:p.z+(z/weight-p.z)*blend,t:p.t});
 }
 output[0]={...raw[0]};output[output.length-1]={...raw.at(-1)!};return output;
}
/** Time subdivision preserves dwell/strength while retaining exactly the preview polyline. */
export function clayReplay(path:readonly PathPoint[]):PathPoint[]{
 const result:PathPoint[]=[];let previous=path[0];if(!previous)return result;
 let time=0;for(const point of path){const dt=point.t-time,steps=Math.max(1,Math.ceil(dt*120));if(result.length+steps>200000)throw new Error('Clay replay exceeds the dab budget.');for(let i=1;i<=steps;i++)result.push(lerp({...previous,t:time},point,i/steps));previous=point;time=point.t;}return result;
}
