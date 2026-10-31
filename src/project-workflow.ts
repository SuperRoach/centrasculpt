import {createBaseProject} from './layers';
import {SDFVolume} from './sdf';
import {saveSculptProject,type ProjectSettings} from './project';
/** Use the same native validation/publication route as Open, retaining the old project on failure. */
export function newProjectData(resolution:number,contents:string,settings:ProjectSettings):ArrayBuffer{
 if(![64,128,192].includes(resolution)||!['sphere','empty'].includes(contents))throw new Error('Invalid new project options.');
 const volume=new SDFVolume(resolution,1.6,contents==='sphere');
 if(contents==='empty')volume.values.fill(volume.extent*4);
 return saveSculptProject(createBaseProject(volume,{...settings,mode:'add'}));
}
/** Browser pickers need a fresh user gesture after session exit. Focus, never synthesize that gesture. */
export async function leaveForProject(session:{exit:()=>Promise<void>;state:string},ready:()=>boolean,show:()=>void):Promise<void>{
 await session.exit();
 if(session.state!=='ready'||!ready())throw new Error('Project action cancelled: exit XR and finish the current edit first.');
 show();
}
