/** Canvas-space design tokens. Physical UI scaling is applied to UI roots only. */
export const VR_UI=Object.freeze({panel:'#17242c',card:'#233640',hover:'#31594f',selected:'#294d44',border:'#718b94',text:'#f0f5f2',muted:'#bbccc9',disabled:'#829197',accent:'#b2e5ce',radius:24,heading:46,label:32,value:36,detail:28,footer:28,radial:30,control:38});
export const VR_UI_SCALES=Object.freeze({normal:1.25,large:1.35});
export type VRUIScale=keyof typeof VR_UI_SCALES;
export function validateVRUIScale(value:unknown):VRUIScale{if(value==='small')return 'normal'; // Migrate saved projects from the retired Small setting.
 if(value!=='normal'&&value!=='large')throw new Error('Invalid VR UI scale.');return value;}
export type TextBox={x:number;y:number;width:number;height:number};
export type TextLine={text:string;x:number;y:number;width:number;height:number};
function widthOf(ctx:CanvasRenderingContext2D,text:string,fontSize:number):number{const width=ctx.measureText?.(text)?.width;return typeof width==='number'&&Number.isFinite(width)?width:text.length*fontSize*.56;}
/** Fixed-size wrapping/ellipsis: never horizontally squeeze fonts or draw outside a box.
 * Returns the exact layout for bounds tests, accessible preview fixtures and diagnostics. */
export function layoutVRText(ctx:CanvasRenderingContext2D,text:string,box:TextBox,size:number,lineHeight=size*1.15):TextLine[]{
 const rows:string[]=[];let line='';for(const word of text.split(/\s+/)){if(!word)continue;const candidate=line?`${line} ${word}`:word;if(widthOf(ctx,candidate,size)<=box.width){line=candidate;continue;}if(line){rows.push(line);line='';}let fragment='';for(const ch of word){if(fragment&&widthOf(ctx,fragment+ch,size)>box.width){rows.push(fragment);fragment='';}fragment+=ch;}line=fragment;}if(line)rows.push(line);
 const count=Math.max(0,Math.floor(box.height/lineHeight)),visible=rows.slice(0,count);if(rows.length>count&&count){let last=visible[count-1];while(last&&widthOf(ctx,last+'…',size)>box.width)last=last.slice(0,-1);visible[count-1]=last+'…';}
 return visible.map((text,i)=>({text,x:box.x,y:box.y+i*lineHeight,width:widthOf(ctx,text,size),height:lineHeight}));
}
export function drawVRText(ctx:CanvasRenderingContext2D,text:string,box:TextBox,size:number,colour:string=VR_UI.text,bold=false,align:'left'|'center'='left'):TextLine[]{
 ctx.font=`${bold?'600 ':''}${size}px sans-serif`;ctx.fillStyle=colour;ctx.textAlign=align;ctx.textBaseline='top';const lines=layoutVRText(ctx,text,box,size,size*1.05);for(const line of lines)ctx.fillText(line.text,align==='center'?box.x+box.width/2:line.x,line.y);return lines;
}
export function roundedVRRect(ctx:CanvasRenderingContext2D,x:number,y:number,width:number,height:number,radius:number=VR_UI.radius):void{
 const r=Math.min(radius,width/2,height/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+width-r,y);ctx.quadraticCurveTo(x+width,y,x+width,y+r);ctx.lineTo(x+width,y+height-r);ctx.quadraticCurveTo(x+width,y+height,x+width-r,y+height);ctx.lineTo(x+r,y+height);ctx.quadraticCurveTo(x,y+height,x,y+height-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
export function paintVRPanel(ctx:CanvasRenderingContext2D,width:number,height:number):void{ctx.clearRect(0,0,width,height);roundedVRRect(ctx,4,4,width-8,height-8,32);ctx.fillStyle=VR_UI.panel;ctx.fill();ctx.strokeStyle=VR_UI.border;ctx.lineWidth=2;ctx.stroke();}
export function vrControlStyle(disabled=false,hover=false,selected=false,active=false){return {fill:disabled?'#263138':active?'#427465':hover?VR_UI.hover:selected?VR_UI.selected:VR_UI.card,stroke:disabled?VR_UI.disabled:active||hover?VR_UI.text:selected?VR_UI.accent:VR_UI.border,text:disabled?VR_UI.disabled:VR_UI.text,lineWidth:!disabled&&(active||hover||selected)?4:2};}
