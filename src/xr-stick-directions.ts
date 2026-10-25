export type StickDirection='left'|'right'|'up'|'down';
export type StickDirectionOptions={neutral?:number;press?:number;release?:number;dominance?:number};
/** One excursion, one activation. Diagonals consume the excursion, never slide into a command.
 * Values use Gamepad convention: negative X left, negative Y up. No hardware parsing here. */
export class FourDirectionStick {
 private armed=false;private latched:StickDirection|null=null;
 held:StickDirection|null=null;
 readonly neutral:number;readonly press:number;readonly release:number;readonly dominance:number;
 constructor(options:StickDirectionOptions={}){
  this.neutral=options.neutral??.18;this.press=options.press??.65;this.release=options.release??.4;this.dominance=options.dominance??1.5;
  if(![this.neutral,this.press,this.release,this.dominance].every(Number.isFinite)||!(this.neutral>=0&&this.neutral<this.release&&this.release<this.press&&this.press<=1&&this.dominance>1))throw new Error('Invalid stick direction thresholds.');
 }
 reset():void{this.armed=false;this.latched=this.held=null;}
 update(x:number,y:number,enabled=true):StickDirection|null{
  if(!enabled||!Number.isFinite(x)||!Number.isFinite(y)){this.reset();return null;}
  x=Math.max(-1,Math.min(1,x));y=Math.max(-1,Math.min(1,y));
  const ax=Math.abs(x),ay=Math.abs(y),magnitude=Math.hypot(x,y);
  if(magnitude<=this.neutral){this.armed=true;this.latched=this.held=null;return null;}
  if(this.latched){const value=this.latched==='left'?-x:this.latched==='right'?x:this.latched==='up'?-y:y;if(value<this.release)this.held=null;return null;}
  if(!this.armed||magnitude<this.press)return null;
  this.armed=false;
  if(Math.max(ax,ay)<this.press||Math.max(ax,ay)<Math.min(ax,ay)*this.dominance)return null;
  this.latched=ax>ay?(x<0?'left':'right'):(y<0?'up':'down');this.held=this.latched;return this.latched;
 }
}
