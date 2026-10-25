/** Explicit opt-in development runtime. Never injected on a physical Quest or production build. */
export async function installQuestEmulator():Promise<((time:number)=>void)|null>{
 if(navigator.xr&&await navigator.xr.isSessionSupported('immersive-vr'))return null;
 const [{XRDevice,metaQuest3},{DevUI}]=await Promise.all([import('iwer'),import('@iwer/devui')]);
 const device=new XRDevice(metaQuest3);device.stereoEnabled=true;device.installRuntime({forceInstall:true});
 const ui=new DevUI(device);device.position.set(0,1.6,0);
 // The package owns its development controls; no emulated controller feeds app editing.
 return time=>ui.render(time);
}
