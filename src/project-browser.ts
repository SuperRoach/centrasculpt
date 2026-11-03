import type {MenuContent,MenuButton} from './xr-menu-model';
import {ProjectLibrary,libraryName,type ProjectRecord} from './project-library';
import {describeNative,renameNative} from './library-codec';
import {newId} from './layers';
export interface BrowserPort{
 key():string;ready():boolean;encode():Promise<ArrayBuffer>;open(data:ArrayBuffer,name:string):Promise<boolean>;
 thumbnail?():string|undefined|Promise<string|undefined>;
 create(resolution:number,contents:string):Promise<ArrayBuffer>;handoff(action:'import'|'export',data?:ArrayBuffer,name?:string):Promise<void>;
 changed():void;
}
/** Shared desktop / XR state machine. Library identity is independent of the native scene identity. */
export class ProjectBrowser{
 records:ProjectRecord[]=[];selected:string|null=null;current:ProjectRecord|null=null;name='Untitled';savedKey='';busy=false;status='Browser-local saves · separate from recovery and downloads';page=0;
 error=false;
 form:'new'|'save-as'|'rename'|null=null;draft='';resolution=64;contents='sphere';
 private pending:(()=>Promise<void>)|null=null;confirmation:'replace'|'delete'|null=null;private deleteTarget:ProjectRecord|null=null;
 constructor(readonly store:ProjectLibrary,readonly port:BrowserPort){}
 get dirty(){return this.savedKey!==this.port.key();}
 adopted(record:ProjectRecord|null,name:string,clean=false){this.current=record;this.name=name;this.savedKey=clean?this.port.key():'';this.port.changed();}
 async refresh(){this.records=await this.store.list();if(this.selected&&!this.records.some(r=>r.id===this.selected))this.selected=null;this.page=Math.min(this.page,Math.max(0,Math.ceil(this.records.length/3)-1));this.port.changed();}
 async run(action:()=>Promise<void>){if(this.busy)return;this.busy=true;this.error=false;this.port.changed();try{await action();}catch(e){this.error=true;this.status=e instanceof Error?e.message:String(e);}finally{this.busy=false;this.port.changed();}}
 private async save(asNew=false){if(!this.port.ready())throw new Error('Finish the current edit before saving.');const key=this.port.key(),name=libraryName(asNew?this.draft:this.name),data=renameNative(await this.port.encode(),name,asNew);if(this.port.key()!==key||!this.port.ready())throw new Error('Save cancelled: current work changed. Previous save kept.');let thumbnail:string|undefined;try{thumbnail=await this.port.thumbnail?.();}catch{/* Preview failure must never prevent the explicit project save. */}if(this.port.key()!==key||!this.port.ready())throw new Error('Save cancelled: current work changed. Previous save kept.');const record=describeNative(data,name);record.id=asNew||!this.current?newId():this.current.id;record.opened=Date.now();record.sourceVersion=this.current&&!asNew?this.current.sourceVersion:record.sourceVersion;if(thumbnail&&thumbnail.length<=32768)record.thumbnail=thumbnail;else if(!asNew&&this.current?.thumbnail)record.thumbnail=this.current.thumbnail;const stored=await this.store.put(record,data,asNew?null:this.current?.revision??null);this.current=stored;this.name=name;this.savedKey=key;this.status='Saved in this browser. Download a portable backup from project details.';await this.refresh();}
 private async replace(action:()=>Promise<void>){if(!this.port.ready())throw new Error('Finish the current edit before replacing the project.');if(this.dirty){this.pending=action;this.confirmation='replace';}else await action();}
 private async open(record:ProjectRecord){const key=this.port.key(),{record:latest,data}=await this.store.read(record.id);if(key!==this.port.key()||!this.port.ready())throw new Error('Open cancelled: current work changed.');if(latest.revision!==record.revision)throw new Error('Project changed in another tab. Refresh before opening.');if(await this.port.open(renameNative(data,latest.name),latest.name)){this.adopted(latest,latest.name,true);this.status='Opened saved project · fresh Undo history.';try{this.current=await this.store.metadata(latest.id,latest.revision,{opened:Date.now()});}catch{this.status='Opened; last-opened timestamp could not be recorded.';}await this.refresh();}}
 async activate(id:string):Promise<void>{
  if(!id.startsWith('library:')||this.busy)return;const action=id.slice(8);
  await this.run(async()=>{
   if(action==='refresh'||action==='reload'){await this.refresh();return;}
   if(action==='cancel'){this.confirmation=null;this.pending=null;this.form=null;return;}
   if(action==='download-current'){if(!this.port.ready())throw new Error('Finish the current edit before downloading.');const data=renameNative(await this.port.encode(),this.name);await this.port.handoff('export',data,this.name);return;}
   if(action==='save'){await this.save();return;}
   if(action==='save-replace'||action==='discard-replace'){const pending=this.pending;if(!pending)return;if(action==='save-replace')await this.save();if(!this.port.ready())throw new Error('Finish the current edit first.');this.pending=null;this.confirmation=null;await pending();return;}
   if(action==='delete-confirm'){const r=this.deleteTarget;if(!r)return;await this.store.delete(r.id,r.revision);if(this.current?.id===r.id){this.current=null;this.savedKey='';}this.confirmation=null;this.selected=null;await this.refresh();this.status='Browser-local project deleted. Open work and downloaded files kept.';return;}
   if(action==='previous'||action==='next'){this.page+=action==='next'?1:-1;return;}
   if(action==='clear'){this.selected=null;return;}
   if(action.startsWith('select:')){this.selected=action.slice(7);return;}
   if(action==='new'||action==='save-as'||action==='rename'){this.confirmation=null;this.pending=null;this.form=action;this.draft=action==='new'?'Untitled':action==='rename'?(this.records.find(r=>r.id===this.selected)?.name??this.name):`${this.name.slice(0,70)} copy`;return;}
   if(action==='backspace'){this.draft=this.draft.slice(0,-1);return;}
   if(action.startsWith('key:')){if(this.draft.length<80)this.draft+=action.slice(4);return;}
   if(action==='clear-name'){this.draft='';return;}
   if(action==='resolution'){this.resolution=({64:128,128:192,192:64} as Record<number,number>)[this.resolution];return;}
   if(action==='contents'){this.contents=this.contents==='sphere'?'empty':'sphere';return;}
   if(action==='submit'){
    const name=libraryName(this.draft),form=this.form;
    if(form==='save-as'){await this.save(true);this.form=null;}
    else if(form==='rename'){const r=this.records.find(r=>r.id===this.selected);if(!r)return;const next=await this.store.metadata(r.id,r.revision,{name});if(this.current?.id===r.id){this.current=next;this.name=name;}this.form=null;await this.refresh();}
    else if(form==='new'){const resolution=this.resolution,contents=this.contents;this.form=null;await this.replace(async()=>{const key=this.port.key(),data=renameNative(await this.port.create(resolution,contents),name);if(key!==this.port.key()||!this.port.ready())throw new Error('New project cancelled: current work changed.');if(await this.port.open(data,name)){this.adopted(null,name);this.selected=null;this.status='New project · save to keep it in this browser.';}});}
    return;
   }
   if(action==='import'){await this.port.handoff('import');return;}
   const record=this.records.find(r=>r.id===this.selected);if(!record)return;
   if(action==='open')await this.replace(()=>this.open(record));
   else if(action==='delete'){this.deleteTarget=record;this.confirmation='delete';}
   else if(action==='duplicate'){const {record:latest,data}=await this.store.read(record.id),name=`${latest.name.slice(0,70)} copy`,copy=renameNative(data,name,true),r=describeNative(copy,name,latest.sourceVersion);r.id=newId();await this.store.put(r,copy,null);this.selected=r.id;await this.refresh();this.status='Independent copy saved, including embedded assets.';}
   else if(action==='download'){const {record:r,data}=await this.store.read(record.id);await this.port.handoff('export',renameNative(data,r.name),r.name);}
  });
 }
 content():MenuContent{
  const buttons:MenuButton[]=[],labels:MenuContent['labels']=[];const add=(id:string,label:string,x:number,y:number,width=524,height=96,detail?:string,disabled=false)=>buttons.push({id:`library:${id}`,label,detail,disabled:this.busy||disabled,rect:{x,y,width,height}});
  add('refresh','Refresh',40,140,240,74);add('save',this.dirty?'Save changes':'Save',300,140,240,74,undefined,!this.port.ready());add('save-as','Save As…',560,140,240,74,undefined,!this.port.ready());add('download-current','Download current',820,140,292,74,undefined,!this.port.ready());
  if(this.confirmation){labels.push({text:this.confirmation==='delete'?`Delete “${this.deleteTarget?.name}” from this browser?`:'Current work has unsaved changes.',x:56,y:300,width:1040,height:100},{text:'Recovery checkpoints and downloaded files are separate.',x:56,y:420,width:1040,height:100});
   if(this.confirmation==='replace'){add('save-replace','Save & continue',40,600);add('discard-replace','Discard edits & continue',588,600);}else add('delete-confirm','Delete saved project',40,600,1072);
   add('cancel','Cancel · keep current work',40,750,1072);
  }else if(this.form){labels.push({text:`${this.form.replace('-',' ').toUpperCase()} · ${this.draft||'Enter a name'}`,x:56,y:240,width:1040,height:80});
   const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -';[...chars].forEach((c,i)=>add(`key:${c}`,c===' '?'Space':c,40+(i%8)*135,340+Math.floor(i/8)*90,125,80));
   add('backspace','⌫',40,805,250,80);add('clear-name','Clear name',310,805,250,80);
   if(this.form==='new'){add('resolution',`${this.resolution}³`,580,805,250,80);add('contents',this.contents,850,805,262,80);}
   add('submit','Confirm',40,930);add('cancel','Cancel',588,930);
  }else if(this.selected){const r=this.records.find(r=>r.id===this.selected);if(r){labels.push({text:r.name,x:56,y:245,width:1040,height:70},{text:`${r.thumbnail?'Preview saved':'Preview unavailable'} · ${r.layers} layers · ${r.resolutions.join(' / ')}³ · ${(r.bytes/1048576).toFixed(1)} MiB`,x:56,y:325,width:1040,height:70},{text:`Edited ${new Date(r.modified).toLocaleString()}`,x:56,y:400,width:1040,height:60},{text:`Opened ${r.opened?new Date(r.opened).toLocaleString():'never'} · native v${r.version} (source v${r.sourceVersion})`,x:56,y:460,width:1040,height:70});add('open','Open project',40,560,524,100,undefined,!this.port.ready());buttons.find(b=>b.id==='library:open')!.thumbnail=r.thumbnail;add('rename','Rename',588,560);add('duplicate','Duplicate',40,690);add('download','Download .form',588,690);add('delete','Delete…',40,820);add('clear','‹ Library',588,820);}}
  else{add('new','New Project…',40,240);add('import','Import .form…',588,240);this.records.slice(this.page*3,this.page*3+3).forEach((r,i)=>{add(`select:${r.id}`,`◇ ${r.name}`,40,370+i*168,1072,150,`${r.resolutions.join('/')}³ · ${r.layers} layers · ${new Date(r.modified).toLocaleDateString()}`);buttons.at(-1)!.thumbnail=r.thumbnail;});if(!this.records.length)labels.push({text:'No saved projects yet. Create a project or import a .form file.',x:56,y:450,width:1040,height:160});add('previous','‹ Previous',40,900,340,90,undefined,this.page===0);add('reload','Refresh list',405,900,340,90);add('next','Next ›',770,900,342,90,undefined,(this.page+1)*3>=this.records.length);}
  return {title:'PROJECT LIBRARY',subtitle:`${this.name} · ${this.dirty?'Unsaved changes':'Saved in browser'}`,buttons,labels,footer:this.busy?'Working… · keep this page open':this.status};
 }
}
