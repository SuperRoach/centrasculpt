/** Canvas mock with approximate font metrics, geometry no-ops and inspectable text.
 * Real browser screenshots remain required for visual assessment. */
export function canvasContext(overrides={}){const ctx={font:'10px sans-serif',measureText(text){return {width:String(text).length*(Number.parseFloat(this.font.match(/[\d.]+px/)?.[0]??'10')*.52)};},...overrides};return new Proxy(ctx,{get:(target,key)=>key in target?target[key]:()=>{}});}
