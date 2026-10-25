import type {IndependentLayers} from './independent-layers';
import type {XRShortcutResult} from './xr-support-shortcuts';
/** Adapt to the existing project timeline; never finish an in-progress transaction. */
export function projectHistoryShortcuts(layers:()=>IndependentLayers,changed:()=>void=()=>{}):Readonly<Record<'undo'|'redo',()=>XRShortcutResult>>{
 const run=(redo:boolean):XRShortcutResult=>{
  const project=layers();
  if(project.transforming||project.drawing)return {ok:false,message:'Finish the current edit first'};
  if(!(redo?project.redoCount:project.undoCount))return {ok:false,message:redo?'Nothing to redo':'Nothing to undo'};
  try{
   const id=project.undo(redo);
   if(!id)return {ok:false,message:redo?'Nothing to redo':'Nothing to undo'};
  }catch{return {ok:false,message:'History unavailable — check layer locks or busy project'};}
  changed();return {ok:true,message:redo?'Redone':'Undone'};
 };
 return {undo:()=>run(false),redo:()=>run(true)};
}
