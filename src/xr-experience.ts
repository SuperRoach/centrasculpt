import type {PerspectiveCamera,WebGLRenderer,Object3D} from 'three';
import {XRPerformancePanel} from './xr-performance';
import type {XRSculptureInfo} from './xr-performance';
import {ControllerModels} from './controller-models';
import {FactoryControllerModelProvider} from './controller-model-provider';
import {XRControllers} from './xr-controllers';
import {XRDiagnostics} from './xr-diagnostics';
import {XRSceneRig} from './xr-scene';
import {XRControllerRoles} from './xr-controller-roles';
import {XRFrameStats,XRSessionController} from './xr-session';
export type XRExperienceHooks={canEnter:()=>boolean;lockDesktop:(blocked:boolean)=>void;restored:()=>void;hidden:readonly Object3D[];sculptureInfo?:()=>XRSculptureInfo};
/** Existing renderer/session bridge. All editing remains desktop-only in 1.12c. */
export class XRExperience {
 readonly session:XRSessionController;
 readonly roles=new XRControllerRoles();
 readonly controllers:XRControllers;
 readonly diagnostics:XRDiagnostics;
 readonly stats=new XRFrameStats();
 readonly performancePanel=new XRPerformancePanel();
 private sculpture:XRSculptureInfo={activeResolution:'unknown',resolutions:'unknown',layerMeshes:0,compositeMeshes:0};
 private lastPerformance=-Infinity;
 readonly button:HTMLButtonElement;
 private readonly reason:HTMLElement;
 private readonly metrics:HTMLElement;
 private readonly sourceInfo:HTMLElement;private readonly renderMetrics:HTMLElement;
 private lastReport=0;
 private framesWithPose=0;
 constructor(readonly renderer:WebGLRenderer,readonly rig:XRSceneRig,private readonly hooks:XRExperienceHooks,readonly emulated=false){
  renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local');renderer.xr.setFramebufferScaleFactor(.8);renderer.xr.setFoveation(1);
  this.diagnostics=new XRDiagnostics();this.controllers=new XRControllers(renderer.xr,rig.controllerTracking,this.roles,this.diagnostics,()=>this.syncDebugControls(),{workspace:rig.workspaceRoot,models:new ControllerModels(new FactoryControllerModelProvider()),resetView:()=>rig.resetWorkspaceView(),setPerformance:enabled=>this.performancePanel.setEnabled(enabled)});
  const header=document.querySelector('#xr-entry-slot')!,panel=document.querySelector('#xr-diagnostics-slot')!;
  header.innerHTML='<button type="button" id="enter-vr" disabled>Checking VR…</button>';
  panel.innerHTML='<details class="xr-diagnostics"><summary>VR / WEBXR DIAGNOSTICS</summary><p id="xr-reason" role="status"></p><p id="xr-session-state"></p><label for="xr-tool-hand">DOMINANT TOOL HAND</label><select id="xr-tool-hand"><option value="right">Right tool / Left support</option><option value="left">Left tool / Right support</option></select><label><input type="checkbox" id="xr-show-diagnostics" checked> Show in-headset diagnostics</label><label for="xr-controller-display">CONTROLLER DISPLAY</label><select id="xr-controller-display"><option value="realistic">Realistic · fallback indicators</option><option value="simple">Simple indicators</option><option value="minimal">Minimal tool indicators</option></select><label for="xr-hints">CONTROL HINTS</label><select id="xr-hints"><option value="hidden">Hidden</option><option value="on-demand" selected>On demand · point at card / touch stick</option><option value="always">Always visible</option></select><label><input id="xr-show-performance" type="checkbox"> Show VR performance</label><button type="button" id="xr-reset-workspace" disabled>Reset Workspace View</button><p>Support grip grabs workspace. Tool editing, layer grab and locomotion remain disabled.</p><output id="xr-metrics">XR frame diagnostics appear during a session.</output><p id="xr-input-sources"></p><output id="xr-render-metrics">Performance sampling is off.</output></details>';
  this.button=document.querySelector<HTMLButtonElement>('#enter-vr')!;this.reason=document.querySelector('#xr-reason')!;this.metrics=document.querySelector('#xr-metrics')!;this.sourceInfo=document.querySelector('#xr-input-sources')!;this.renderMetrics=document.querySelector('#xr-render-metrics')!;
  this.session=new XRSessionController(renderer.xr,{
   prepare:()=>{this.rig.enter(hooks.hidden);this.sculpture=hooks.sculptureInfo?.()??this.sculpture;rig.controllerTracking.add(this.performancePanel.mesh);this.performancePanel.start();this.lastPerformance=-Infinity;this.stats.reset();this.framesWithPose=0;},
   restore:()=>{this.performancePanel.stop();this.controllers.stop();this.rig.exit();hooks.restored();},changed:()=>this.update(),
  });
  this.button.addEventListener('click',()=>{if(this.session.state==='presenting')void this.session.exit();else if(hooks.canEnter())void this.session.enter();});
  document.querySelector<HTMLSelectElement>('#xr-tool-hand')!.addEventListener('change',event=>this.controllers.setDominant((event.target as HTMLSelectElement).value));
  document.querySelector<HTMLSelectElement>('#xr-controller-display')!.addEventListener('change',event=>this.controllers.setDisplay((event.target as HTMLSelectElement).value));
  document.querySelector<HTMLSelectElement>('#xr-hints')!.addEventListener('change',event=>this.controllers.setHints((event.target as HTMLSelectElement).value));
  document.querySelector<HTMLInputElement>('#xr-show-performance')!.addEventListener('change',event=>this.controllers.setPerformance((event.target as HTMLInputElement).checked));
  document.querySelector('#xr-reset-workspace')!.addEventListener('click',()=>this.controllers.resetWorkspaceView());
  document.querySelector<HTMLInputElement>('#xr-show-diagnostics')!.addEventListener('change',event=>this.controllers.setDiagnostics((event.target as HTMLInputElement).checked));
 }
 private syncDebugControls():void{const hand=document.querySelector<HTMLSelectElement>('#xr-tool-hand'),show=document.querySelector<HTMLInputElement>('#xr-show-diagnostics');if(hand)hand.value=this.roles.dominant;if(show)show.checked=this.diagnostics.expanded;const display=document.querySelector<HTMLSelectElement>('#xr-controller-display'),hints=document.querySelector<HTMLSelectElement>('#xr-hints');if(display)display.value=this.controllers.displayMode;if(hints)hints.value=this.diagnostics.hints.mode;const perf=document.querySelector<HTMLInputElement>('#xr-show-performance');if(perf)perf.checked=this.performancePanel.enabled;}
 get blocking():boolean{return this.session.blocking;}
 async check():Promise<void>{await this.session.check(window.isSecureContext,navigator.xr);}
 refreshButton():void {
  if(this.session.state!=='ready')return;
  const busy=!this.hooks.canEnter();this.button.disabled=busy;
  this.button.title=busy?'Finish the current project operation or wait for the Boolean preview before entering VR.':this.session.reason;
 }
 private update():void {
  const s=this.session;if(s.state==='presenting'&&s.session)this.controllers.start(s.session);this.button.textContent=s.state==='presenting'?'Exit VR':s.state==='requesting'?'Starting VR…':s.state==='ending'?'Exiting VR…':s.state==='ready'?'Enter VR':'VR unavailable';
  this.button.disabled=s.state!=='ready'&&s.state!=='presenting';this.button.title=s.reason;this.reason.textContent=(this.emulated?'EMULATED QUEST 3 · ':'')+s.reason;
  document.querySelector<HTMLSelectElement>('#xr-tool-hand')!.disabled=s.state==='requesting'||s.state==='ending';
  document.querySelector<HTMLButtonElement>('#xr-reset-workspace')!.disabled=s.state!=='presenting';
  document.querySelector('#xr-session-state')!.textContent=`Session: ${s.state} · Secure context: ${window.isSecureContext?'yes':'no'} · WebXR API: ${navigator.xr?'available':'absent'}${s.session?` · Blend: ${s.session.environmentBlendMode}`:''}`;
  this.hooks.lockDesktop(this.blocking);this.refreshButton();
 }
 frame(time:number,frame:XRFrame):void {
  const reference=this.renderer.xr.getReferenceSpace(),pose=reference?frame.getViewerPose(reference):null;
  if(pose){this.rig.placeFirstView(pose.transform.position,pose.transform.orientation);this.controllers.placePanel(pose.transform.position,pose.transform.orientation);this.performancePanel.place(pose.transform.position,pose.transform.orientation);this.framesWithPose++;}
  this.controllers.update(time);
  this.stats.frame(time);
  if(time-this.lastReport>=1000){this.lastReport=time;this.metrics.textContent=`${this.emulated?'EMULATOR · ':''}${this.stats.fps.toFixed(1)} FPS · interval ${this.stats.averageMs.toFixed(2)} ms · p95 ${this.stats.p95Ms.toFixed(2)} ms · JS render ${this.stats.cpuMs.toFixed(2)} ms · ${this.framesWithPose} tracked frames · ${this.controllers.grab?.state??'idle'} · input/debug ${this.controllers.inputMs.toFixed(3)} ms · ${this.rig.workspaceRoot.scale.x.toFixed(4)} m / model unit`;
   this.metrics.dataset.frames=String(this.stats.frames);this.metrics.dataset.fps=String(this.stats.fps);this.sourceInfo.textContent=this.controllers.describe();
  }
 }
 finishFrame(cpuMs:number):void{this.stats.cpuMs=cpuMs;const time=performance.now();if(this.performancePanel.enabled&&this.session.state==='presenting'&&time-this.lastPerformance>=500){this.lastPerformance=time;const render=this.renderer.info.render;this.renderMetrics.textContent=`Last frame: ${render.calls} draw calls · ${render.triangles.toLocaleString()} rendered triangles · active ${this.sculpture.activeResolution} · visible meshes ${this.sculpture.layerMeshes} layer / ${this.sculpture.compositeMeshes} composite · peak ${this.stats.maxMs.toFixed(2)} ms · spikes ${this.stats.spikes}`;this.performancePanel.paint(time,{fps:this.stats.fps,averageMs:this.stats.averageMs,latestMs:this.stats.latestMs,maxMs:this.stats.maxMs,p95Ms:this.stats.p95Ms,spikes:this.stats.spikes,cpuMs,inputMs:this.controllers.inputMs,calls:render.calls,triangles:render.triangles,sculpture:this.sculpture});}}
}
