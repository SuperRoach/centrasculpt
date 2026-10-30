import {Euler,Quaternion,Vector3,type Matrix4} from 'three';
import {identityTransform,transformMatrix,validateTransform,uniformScale,copyTransform,type VolumeTransform} from './transform';
import {newId,validateId,validateName,type LayerStack,type SdfLayer} from './layers';
export const MAX_LAYER_GROUPS=32,MAX_GROUP_DEPTH=8;
export type HierarchyLeaf={id:string;name:string;transform:VolumeTransform;visible:boolean;locked:boolean;parentId:string|null};
export type GroupRecord=HierarchyLeaf&{kind:'group'};
export type HierarchyState={version:1;groups:GroupRecord[];layers:HierarchyLeaf[];order:string[];compositionOrder:string[]};
export function matrixTransform(matrix:Matrix4):VolumeTransform{const p=new Vector3(),q=new Quaternion(),s=new Vector3(),e=new Euler();matrix.decompose(p,q,s);e.setFromQuaternion(q,'XYZ');return validateTransform({position:p.toArray(),rotation:[e.x,e.y,e.z].map(v=>v===0?0:v),scale:s.toArray()});}
export class LayerGroup {
 readonly kind='group';
 constructor(readonly owner:LayerHierarchy,public record:GroupRecord){}
 get id(){return this.record.id;}get name(){return this.record.name;}set name(v:string){this.record.name=validateName(v);}
 get localTransform(){return this.record.transform;}set localTransform(v:VolumeTransform){uniformScale(v);v=validateTransform(v);const state=this.owner.snapshot();state.groups.find(g=>g.id===this.id)!.transform=v;validateHierarchy(state,state.layers.map(l=>l.id));this.record.transform=v;}
 get parentId(){return this.record.parentId;}
 get transform(){return this.owner.world(this.id);}set transform(v:VolumeTransform){this.localTransform=this.owner.toParent(this.id,v);}
 get localVisible(){return this.record.visible;}get localLocked(){return this.record.locked;}
 get visible(){return this.record.visible&&this.owner.parentsVisible(this.id);}set visible(v:boolean){this.record.visible=v;}
 get locked(){return this.record.locked||this.owner.parentsLocked(this.id);}set locked(v:boolean){this.record.locked=v;}
 get editable(){return this.visible&&!this.locked;}
 assertEditable(){if(!this.editable)throw new Error('Group is hidden or locked.');}
}
/** Containers only. Effective transforms are evaluated in sculpture coordinates; no workspace/Turntable data. */
export class LayerHierarchy {
 private records:LayerGroup[]=[];private parents=new Map<string,string>();private ordering:string[]=[];private composition:string[]=[];
 constructor(private readonly stack:LayerStack){}
 get groups():readonly LayerGroup[]{return [...this.records];}
 get enabled(){return this.records.length>0||this.parents.size>0||this.compositionOrder.join()!==this.stack.layers.map(l=>l.id).join();}
 get compositionOrder():string[]{const ids=this.stack.layers.map(l=>l.id);return [...this.composition.filter(id=>ids.includes(id)),...ids.filter(id=>!this.composition.includes(id))];}
 get order():string[]{const ids=[...this.stack.layers.map(l=>l.id),...this.records.map(g=>g.id)];return [...this.ordering.filter(id=>ids.includes(id)),...ids.filter(id=>!this.ordering.includes(id))];}
 get(id:string):SdfLayer|LayerGroup{return this.records.find(g=>g.id===id)??this.stack.get(id);}
 parent(id:string):string|null{return this.records.find(g=>g.id===id)?.parentId??this.parents.get(id)??null;}
 private ancestors(id:string):LayerGroup[]{const result:LayerGroup[]=[];let at=this.parent(id);while(at){const g=this.records.find(g=>g.id===at);if(!g||result.length>=MAX_GROUP_DEPTH)throw new Error('Invalid hierarchy parent or cycle.');result.push(g);at=g.parentId;}return result;}
 parentsVisible(id:string){return this.ancestors(id).every(g=>g.localVisible);}
 parentsLocked(id:string){return this.ancestors(id).some(g=>g.localLocked);}
 world(id:string):VolumeTransform{const node=this.get(id),ancestors=this.ancestors(id);if(!ancestors.length)return node.localTransform;let matrix=transformMatrix(node.localTransform);for(const g of ancestors)matrix.premultiply(transformMatrix(g.localTransform));return matrixTransform(matrix);}
 toParent(id:string,world:VolumeTransform):VolumeTransform{const parent=this.parent(id);return parent?matrixTransform(transformMatrix(this.world(parent)).invert().multiply(transformMatrix(world))):validateTransform(world);}
 bind(layer:SdfLayer){layer.hierarchy=this;if(!this.composition.includes(layer.id))this.composition.push(layer.id);}
 forget(id:string){this.parents.delete(id);this.ordering=this.ordering.filter(x=>x!==id);this.composition=this.composition.filter(x=>x!==id);}
 snapshot():HierarchyState{return {version:1,groups:this.records.map(g=>structuredClone(g.record)),layers:this.stack.layers.map(l=>({id:l.id,name:l.name,transform:copyTransform(l.localTransform),visible:l.localVisible,locked:l.localLocked,parentId:this.parent(l.id)})),order:this.order,compositionOrder:this.compositionOrder};}
 restore(value:unknown):void{
  const s=validateHierarchy(value,this.stack.layers.map(l=>l.id));
  // All validation, cycle checks and transforms precede the nonthrowing publication.
  const groups=s.groups.map(g=>new LayerGroup(this,g)),parents=new Map<string,string>();for(const l of s.layers)if(l.parentId)parents.set(l.id,l.parentId);
  this.records=groups;this.parents=parents;this.ordering=s.order;this.composition=s.compositionOrder;
  for(const saved of s.layers){const layer=this.stack.get(saved.id);layer.name=saved.name;layer.localTransform=saved.transform;layer.visible=saved.visible;layer.locked=saved.locked;layer.hierarchy=this;}
  const leaves=this.rows().filter(row=>!row.group).map(row=>row.id);leaves.forEach((id,index)=>this.stack.move(id,index));
 }
 create(name='Group',parentId:string|null=null):string{const s=this.snapshot(),id=newId();if(name==='Group'){const names=new Set(s.groups.map(g=>g.name));let number=2;while(names.has(name))name=`Group ${number++}`;}s.groups.push({kind:'group',id,name,transform:identityTransform(),visible:true,locked:false,parentId});s.order.push(id);this.restore(s);return id;}
 reparent(id:string,parentId:string|null):void{const world=this.world(id),s=this.snapshot(),node=[...s.groups,...s.layers].find(n=>n.id===id);if(!node)throw new Error('Missing hierarchy node.');node.parentId=parentId;node.transform=parentId?matrixTransform(transformMatrix(this.world(parentId)).invert().multiply(transformMatrix(world))):copyTransform(world);this.restore(s);}
 children(id:string|null):string[]{return this.order.filter(n=>this.parent(n)===id);}
 descendants(id:string):string[]{const result:string[]=[];const visit=(n:string)=>{for(const child of this.children(n)){result.push(child);if(this.records.some(g=>g.id===child))visit(child);}};visit(id);return result;}
 rows(collapsed:ReadonlySet<string>=new Set()):{id:string;depth:number;group:boolean}[]{const out:{id:string;depth:number;group:boolean}[]=[];const visit=(parent:string|null,depth:number)=>{for(const id of this.children(parent)){const group=this.records.some(g=>g.id===id);out.push({id,depth,group});if(group&&!collapsed.has(id))visit(id,depth+1);}};visit(null,0);return out;}
}
export function validateHierarchy(value:unknown,layerIds:readonly string[]):HierarchyState{
 const fail=():never=>{throw new Error('Invalid layer hierarchy (IDs, parents, cycles, depth, order or transform).');};
 if(!value||typeof value!=='object')return fail();const s=value as HierarchyState;
 if(s.version!==1||!Array.isArray(s.groups)||s.groups.length>MAX_LAYER_GROUPS||!Array.isArray(s.layers)||s.layers.length!==layerIds.length||!Array.isArray(s.order)||!Array.isArray(s.compositionOrder))return fail();
 const groups=new Set<string>(),ids=new Set(layerIds),states=[...s.groups,...s.layers];if(new Set(layerIds).size!==layerIds.length)return fail();
 for(const g of s.groups){if(g.kind!=='group'||ids.has(g.id)||groups.has(g.id))return fail();groups.add(validateId(g.id));}
 if(new Set(s.layers.map(l=>l.id)).size!==layerIds.length||s.layers.some(l=>!ids.has(l.id)))return fail();
 const clean=states.map(n=>{if(typeof n.visible!=='boolean'||typeof n.locked!=='boolean'||n.parentId!==null&&(typeof n.parentId!=='string'||!groups.has(n.parentId)))return fail();const transform=validateTransform(n.transform);if(groups.has(n.id))uniformScale(transform);if('kind' in n&&!groups.has(n.id))return fail();return {...(groups.has(n.id)?{kind:'group' as const}:{}),id:validateId(n.id),name:validateName(n.name),transform,visible:n.visible,locked:n.locked,parentId:n.parentId};});
 const all=new Set([...ids,...groups]);for(const n of clean){const seen=new Set([n.id]);let parent=n.parentId,depth=0;while(parent){if(seen.has(parent)||++depth>MAX_GROUP_DEPTH)return fail();seen.add(parent);parent=clean.find(x=>x.id===parent)?.parentId??null;}}
 for(const n of clean){let m=transformMatrix(n.transform),at=n.parentId;while(at){const parent=clean.find(p=>p.id===at)!;m.premultiply(transformMatrix(parent.transform));at=parent.parentId;}matrixTransform(m);}
 const exact=(list:string[],set:Set<string>)=>list.length===set.size&&new Set(list).size===set.size&&list.every(id=>set.has(id));if(!exact(s.order,all)||!exact(s.compositionOrder,ids))return fail();
 return {version:1,groups:clean.filter(n=>groups.has(n.id)) as GroupRecord[],layers:clean.filter(n=>ids.has(n.id)),order:[...s.order],compositionOrder:[...s.compositionOrder]};
}
