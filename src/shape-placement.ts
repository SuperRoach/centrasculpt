import { Vector3 } from 'three';
import type { LayerStack } from './layers';
import type { ShapePreviewModel } from './shape-preview';
import type { Point3 } from './sdf';
import type { ShapeDefinition } from './shapes';
import { toLocal } from './transform';

/** Placement changes the preview only; orientation/dimensions/scale remain unchanged. */
export function placeShapeOnSurface(model:ShapePreviewModel,stack:LayerStack,worldPoint:Point3):void {
 const point=toLocal(worldPoint,stack.active.transform),d=model.definition;
 if(!new Vector3(point.x,point.y,point.z).toArray().every(Number.isFinite))throw new Error('Invalid surface position.');
 model.set({...d,targetLayerId:stack.activeLayerId,transform:{...d.transform,position:[point.x,point.y,point.z]}},stack);
}
/** Completed primary clicks only. Drags, secondary buttons, selection changes and
 * cancellation never emit an intent. Retaining no repeating timer prevents drag stamps. */
export class StampClickGesture {
 private pending:{pointerId:number;x:number;y:number;definition:ShapeDefinition}|null=null;
 begin(pointerId:number,button:number,x:number,y:number,definition:ShapeDefinition,buttons=1,primary=true):boolean {
  if(button!==0||buttons!==1||!primary){this.cancel();return false;}
  if(this.pending){this.cancel();return false;}
  this.pending={pointerId,x,y,definition:structuredClone(definition)};return true;
 }
 move(pointerId:number,x:number,y:number,buttons:number):void {
  const p=this.pending;if(p&&(pointerId!==p.pointerId||buttons!==1||Math.hypot(x-p.x,y-p.y)>5))this.cancel();
 }
 complete(pointerId:number,button:number,x:number,y:number,activeId:string):ShapeDefinition|null {
  const p=this.pending;this.cancel();
  return p&&p.pointerId===pointerId&&button===0&&Math.hypot(x-p.x,y-p.y)<=5&&p.definition.targetLayerId===activeId?p.definition:null;
 }
 cancel():void{this.pending=null;}
}
