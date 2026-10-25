export type TimingSummary={count:number;latest:number;median:number;p95:number|null;p99:number|null;max:number};
/** Bounded sample ring. Sorting occurs only when the optional UI asks for a summary. */
export class TimingWindow {
 private readonly samples=new Float64Array(240);private head=0;private count=0;private last=0;
 add(ms:number):void{if(!Number.isFinite(ms)||ms<0)return;this.samples[this.head]=this.last=ms;this.head=(this.head+1)%this.samples.length;this.count=Math.min(this.samples.length,this.count+1);}
 reset():void{this.head=this.count=this.last=0;}
 summary():TimingSummary{const a=this.samples.slice(0,this.count).sort(),q=(p:number)=>a[Math.max(0,Math.ceil(a.length*p)-1)]??0;return {count:this.count,latest:this.last,median:q(.5),p95:this.count>=20?q(.95):null,p99:this.count>=100?q(.99):null,max:q(1)};}
}
export class SculptMetrics {
 enabled=false;
 readonly brush=new TimingWindow();readonly remesh=new TimingWindow();readonly path=new TimingWindow();readonly stroke=new TimingWindow();
 private processing=0;private inStroke=false;
 trackedHighWaterBytes=0;heapHighWaterBytes=0;
 setEnabled(value:boolean):void{if(this.enabled===value)return;this.enabled=value;this.reset();}
 reset():void{for(const w of [this.brush,this.remesh,this.path,this.stroke])w.reset();this.processing=0;this.inStroke=false;this.trackedHighWaterBytes=this.heapHighWaterBytes=0;}
 beginStroke():void{this.inStroke=this.enabled;this.processing=0;}
 record(kind:'brush'|'remesh'|'path',ms:number):void{if(!this.enabled)return;this[kind].add(ms);if(this.inStroke&&Number.isFinite(ms)&&ms>=0)this.processing+=ms;}
 endStroke(overheadMs:number):void{if(this.enabled&&this.inStroke)this.stroke.add(this.processing+Math.max(0,overheadMs));this.inStroke=false;}
 memory(trackedBytes:number,heapBytes?:number):{trackedBytes:number;trackedHighWaterBytes:number;heapBytes:number|null;heapHighWaterBytes:number|null}{
  if(!Number.isFinite(trackedBytes)||trackedBytes<0)trackedBytes=0;
  const heap=Number.isFinite(heapBytes)&&heapBytes!>=0?heapBytes!:null;
  this.trackedHighWaterBytes=Math.max(this.trackedHighWaterBytes,trackedBytes);if(heap!==null)this.heapHighWaterBytes=Math.max(this.heapHighWaterBytes,heap);
  return {trackedBytes,trackedHighWaterBytes:this.trackedHighWaterBytes,heapBytes:heap,heapHighWaterBytes:heap===null?null:this.heapHighWaterBytes};
 }
}
