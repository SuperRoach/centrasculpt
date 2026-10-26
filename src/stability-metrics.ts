import type {IndependentLayers} from './independent-layers';
/** Bounded resource deltas are diagnostics, not proof of unreachable memory. */
export class StabilityMetrics {
 readonly recent:{time:number;bytes:number;delta:number}[]=[];private previous=0;highWaterBytes=0;
 sample(layers:IndependentLayers,time:number){const r=layers.resourceStats(),bytes=layers.trackedBytes+r.compositeBytes;if(bytes!==this.previous){this.recent.push({time,bytes,delta:bytes-this.previous});if(this.recent.length>32)this.recent.shift();this.previous=bytes;}this.highWaterBytes=Math.max(this.highWaterBytes,bytes);return {...r,trackedBytes:bytes,highWaterBytes:this.highWaterBytes,pressure:bytes>256*1024**2*.85,recent:this.recent.slice()};}
}
