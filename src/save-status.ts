export type SaveState='saved'|'autosaved'|'unsaved'|'saving'|'error'|'recovery';
export function saveState(input:{key:string;manualKey:string;autosaveKey?:string;saving:boolean;editing:boolean;error:boolean;recoveryPending:boolean}):SaveState{
 if(input.saving)return 'saving';
 if(input.error)return 'error';
 if(input.recoveryPending)return 'recovery';
 if(input.editing)return 'unsaved';
 if(input.manualKey===input.key)return 'saved';
 if(input.autosaveKey===input.key)return 'autosaved';
 return 'unsaved';
}
export const SAVE_LABELS:Record<SaveState,string>={saved:'Saved · project file download started',autosaved:'Autosaved · local recovery checkpoint',unsaved:'Unsaved changes',saving:'Saving…',error:'Save error · click to save a project file',recovery:'Saved recovery available · review Local Autosave'};
