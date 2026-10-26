import {XRMoveTool} from './xr-move-tool';
import {XRAlternateTool} from './xr-alternate-tool';
import type {IndependentLayers} from './independent-layers';
import type {PerspectiveCamera,WebGLRenderer,Object3D} from 'three';
import {XRLayerSelection} from './xr-layer-selection';
import {XRBrushSizing} from './xr-brush-sizing';
import {XRShapeStamp,XRToolInteraction} from './xr-shape-stamp';
import {XRClayStroke} from './xr-clay-stroke';
import type {EditorToolState} from './editor-tool-state';
import {XRMenuModel} from './xr-menu-model';
import {XRMenuView} from './xr-menu-view';
import {XRShortcutView} from './xr-shortcut-view';
import {projectHistoryShortcuts} from './xr-history-shortcuts';
import {XRPerformancePanel} from './xr-performance';
import type {XREditMetrics,XRSculptureInfo} from './xr-performance';
import {ControllerModels} from './controller-models';
import {FactoryControllerModelProvider} from './controller-model-provider';
import {XRControllers} from './xr-controllers';
import {XRDiagnostics} from './xr-diagnostics';
import {XRSceneRig} from './xr-scene';
import {XRControllerRoles} from './xr-controller-roles';
import {XRFrameStats,XRSessionController} from './xr-session';
export type XRExperienceHooks={blockedReason?:()=>string;stability?:()=>string;canEnter:()=>boolean;lockDesktop:(blocked:boolean)=>void;restored:()=>void;hidden:readonly Object3D[];tools?:EditorToolState;layers?:()=>IndependentLayers;historyChanged?:()=>void;sculptureInfo?:()=>XRSculptureInfo};
/** Existing renderer/session bridge. Layer editing uses the existing metadata transaction boundary. */
export class XRExperience {
 readonly session:XRSessionController;
 readonly roles=new XRControllerRoles();
 readonly controllers:XRControllers;
 readonly diagnostics:XRDiagnostics;
 readonly stats=new XRFrameStats();
 readonly menus?:XRMenuView;
 readonly clay?:XRClayStroke;
 readonly stamp?:XRShapeStamp;
 readonly move?:XRMoveTool;
 readonly interaction?:XRToolInteraction;
 readonly sizing?:XRBrushSizing;
 readonly alternate?:XRAlternateTool;
 readonly selection?:XRLayerSelection;
 readonly shortcutView=new XRShortcutView();
 readonly performancePanel=new XRPerformancePanel();
 private sculpture:XRSculptureInfo={activeResolution:'unknown',resolutions:'unknown',layerMeshes:0,compositeMeshes:0};
 private lastPerformance=-Infinity;
 readonly button:HTMLButtonElement;
 private readonly reason:HTMLElement;
 private readonly metrics:HTMLElement;
 private readonly sourceInfo:HTMLElement;private readonly renderMetrics:HTMLElement;
 private statsSession:XRSession|null=null;
 private readonly pauseFrames=()=>{if(this.statsSession?.visibilityState!=='visible')this.stats.pause();};
 private lastReport=0;
 private framesWithPose=0;
 constructor(readonly renderer:WebGLRenderer,readonly rig:XRSceneRig,private readonly hooks:XRExperienceHooks,readonly emulated=false){
  renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local');renderer.xr.setFramebufferScaleFactor(.8);renderer.xr.setFoveation(1);
  if(hooks.tools)this.alternate=new XRAlternateTool(hooks.tools);
  if(hooks.tools)this.sizing=new XRBrushSizing(hooks.tools);
  if(hooks.tools)this.menus=new XRMenuView(new XRMenuModel(hooks.tools));
  if(hooks.tools&&hooks.layers)this.clay=new XRClayStroke(hooks.layers,hooks.tools,rig.controllerTracking,()=>{hooks.historyChanged?.();this.refreshSculptureInfo();});
  if(hooks.tools&&hooks.layers&&this.clay){this.move=new XRMoveTool(hooks.layers,hooks.tools,rig.controllerTracking,event=>this.controllers.haptics.pulse(this.controllers.input.byHand(this.roles.dominant),event==='grab'?'grab':'stroke-end'),()=>{hooks.historyChanged?.();this.refreshSculptureInfo();});this.stamp=new XRShapeStamp(hooks.layers,hooks.tools,rig.controllerTracking,()=>{this.controllers.haptics.pulse(this.controllers.input.byHand(this.roles.dominant),'stamp');hooks.historyChanged?.();this.refreshSculptureInfo();});this.interaction=new XRToolInteraction(hooks.tools,this.clay,this.stamp,this.move);}
  if(hooks.tools&&hooks.layers)this.selection=new XRLayerSelection(hooks.layers,hooks.tools,rig.controllerTracking);
  this.diagnostics=new XRDiagnostics();this.controllers=new XRControllers(renderer.xr,rig.controllerTracking,this.roles,this.diagnostics,()=>this.syncDebugControls(),{alternate:this.alternate,selection:this.selection,sizing:this.sizing,stroke:this.interaction,toolMode:()=>hooks.tools?.active??'clay',menus:this.menus,shortcuts:{interactiveMenus:!!this.menus,commands:hooks.layers?projectHistoryShortcuts(hooks.layers,()=>{this.controllers.haptics.pulse(this.controllers.input.byHand(this.roles.support),'history');hooks.historyChanged?.();this.sculpture=hooks.sculptureInfo?.()??this.sculpture;}):undefined},layers:hooks.layers,workspace:rig.workspaceRoot,models:new ControllerModels(new FactoryControllerModelProvider()),resetView:()=>rig.resetWorkspaceView(),setPerformance:enabled=>{this.performancePanel.setEnabled(enabled);hooks.layers?.().metrics.setEnabled(enabled&&this.session.state==='presenting');}});
  const header=document.querySelector('#xr-entry-slot')!,panel=document.querySelector('#xr-diagnostics-slot')!;
  header.innerHTML='<button type="button" id="enter-vr" disabled>Checking VR…</button>';
  panel.innerHTML='<details class="xr-diagnostics"><summary>VR / WEBXR DIAGNOSTICS</summary><p id="xr-reason" role="status"></p><p id="xr-session-state"></p><label for="xr-tool-hand">DOMINANT TOOL HAND</label><select id="xr-tool-hand"><option value="right">Right tool / Left support</option><option value="left">Left tool / Right support</option></select><label><input type="checkbox" id="xr-show-diagnostics" checked> Show in-headset diagnostics</label><label for="xr-controller-display">CONTROLLER DISPLAY</label><select id="xr-controller-display"><option value="realistic">Realistic · fallback indicators</option><option value="simple">Simple indicators</option><option value="minimal">Minimal tool indicators</option></select><label for="xr-hints">CONTROL HINTS</label><select id="xr-hints"><option value="hidden">Hidden</option><option value="on-demand" selected>On demand · point at card / touch stick</option><option value="always">Always visible</option></select><label><input id="xr-haptics" type="checkbox" checked> Subtle controller haptics</label><label><input id="xr-show-performance" type="checkbox"> Show VR performance</label><button type="button" id="xr-reset-workspace" disabled>Reset Workspace View</button><p>In Transform Layer mode, Tool grip moves/rotates the selected visible unlocked layer in Separate Layers. Support grip moves workspace. Both grips rotate/scale workspace. Release commits layer changes; tracking loss cancels. In Transform Layer, point at a visible layer and tap trigger to select it; locked layers can be inspected. Mint bounds mark selection; blue bounds mark hover. Layers Palette handles overlapping/empty layers. Reset Layer Transform in Options asks for confirmation and changes the saved layer, not workspace navigation. Support stick: Left Undo · Right Redo · hold Up Tool Wheel · hold Down Layers. Point with Tool Hand and tap trigger. Selecting a tool opens its Options; release stick to dismiss. Centre to rearm; shortcuts pause during grabs/strokes. Move Tool: choose Non-Elastic or Elastic for a persistent edit, or Preview only to restore on release. Elastic stiffness controls compliance. Point at the active-layer surface and hold Tool trigger to pull. Persistent Move release reconstructs while the preview stays visible, then commits one Undo action. Menus/grips/tracking/session loss cancel unfinished reconstruction. Tool stick Up/Down sizes Clay, Smooth, Move and Stamp while idle; centre after menus/grabs/strokes. Clay places at the Tool tip in free space by default; choose Surface follow in Clay Options if desired. Smooth and Subtract use the same tip and leave empty space unchanged. Create an Empty clay volume on desktop for floating strokes. Add grows the volume automatically within memory limits. Subtract and Smooth do not allocate empty space. Hold Support trigger for alternate Smooth (configurable in Options); release restores the previous brush and settings after any active Tool stroke finishes. Menus/grips take priority; release and re-press after interruption. Hold Tool trigger for Clay/Smooth. Shape Stamp follows the wrist; tap trigger once and release to rearm. Add stamps grow the volume to fit; resource limits reject safely. Steady / Straight Line preview while held and apply after release.</p><output id="xr-metrics">XR frame diagnostics appear during a session.</output><p id="xr-input-sources"></p><output id="xr-render-metrics">Performance sampling is off.</output></details>';
  this.button=document.querySelector<HTMLButtonElement>('#enter-vr')!;this.reason=document.querySelector('#xr-reason')!;this.metrics=document.querySelector('#xr-metrics')!;this.sourceInfo=document.querySelector('#xr-input-sources')!;this.renderMetrics=document.querySelector('#xr-render-metrics')!;
  this.session=new XRSessionController(renderer.xr,{
   prepare:()=>{this.statsSession=this.session.session;this.statsSession?.addEventListener('visibilitychange',this.pauseFrames);this.rig.enter(hooks.hidden);this.sculpture=hooks.sculptureInfo?.()??this.sculpture;rig.controllerTracking.add(this.performancePanel.mesh,this.shortcutView.mesh);this.shortcutView.start();if(this.menus){rig.controllerTracking.add(this.menus.mesh);this.menus.start();}this.performancePanel.start();hooks.layers?.().metrics.setEnabled(this.performancePanel.enabled);this.lastPerformance=-Infinity;this.stats.reset();this.framesWithPose=0;},
   restore:()=>{this.statsSession?.removeEventListener('visibilitychange',this.pauseFrames);this.statsSession=null;this.menus?.stop();this.shortcutView.stop();this.performancePanel.stop();this.controllers.stop();hooks.tools?.clearMoveSelection();hooks.layers?.().metrics.setEnabled(false);this.rig.exit();hooks.restored();},changed:()=>this.update(),
  });
  this.button.addEventListener('click',()=>{if(this.session.state==='presenting')void this.session.exit();else if(hooks.canEnter())void this.session.enter();});
  document.querySelector<HTMLSelectElement>('#xr-tool-hand')!.addEventListener('change',event=>this.controllers.setDominant((event.target as HTMLSelectElement).value));
  document.querySelector<HTMLSelectElement>('#xr-controller-display')!.addEventListener('change',event=>this.controllers.setDisplay((event.target as HTMLSelectElement).value));
  document.querySelector<HTMLSelectElement>('#xr-hints')!.addEventListener('change',event=>this.controllers.setHints((event.target as HTMLSelectElement).value));
  document.querySelector<HTMLInputElement>('#xr-haptics')!.addEventListener('change',event=>this.controllers.haptics.enabled=(event.target as HTMLInputElement).checked);
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
  this.button.title=busy?(this.hooks.blockedReason?.()??'Finish the current project operation or wait for the Boolean preview before entering VR.'):this.session.reason;
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
  if(pose){this.rig.placeFirstView(pose.transform.position,pose.transform.orientation);this.controllers.placePanel(pose.transform.position,pose.transform.orientation);this.performancePanel.place(pose.transform.position,pose.transform.orientation);this.shortcutView.place(pose.transform.position,pose.transform.orientation);this.menus?.place(pose.transform.position,pose.transform.orientation);this.framesWithPose++;}
  this.controllers.update(time);
  this.shortcutView.paint(this.controllers.shortcuts,time,this.session.session?.visibilityState==='visible',!this.menus,`Tool: ${this.hooks.tools?.active??'clay'} · ${this.hooks.tools?.active==='move'&&this.move&&(this.move.active||this.move.notifying)?this.move.feedback:this.sizing?.feedback||this.alternate?.feedback||this.interaction?.feedback||this.selection?.feedback||'Support trigger: alternate brush'}`,this.selection?.feedback?this.controllers.layerGrab?.active?'Release Tool grip to commit · Undo available':this.controllers.grab?.active?'Workspace navigation · project unchanged':'Trigger selects · Tool grip moves/rotates':'Tool stick · Up grows / Down shrinks');
  if(this.session.session?.visibilityState==='visible')this.stats.frame(time);else this.stats.pause();
  if(time-this.lastReport>=1000){this.lastReport=time;this.metrics.textContent=`${this.emulated?'EMULATOR · ':''}${this.stats.fps.toFixed(1)} FPS · interval ${this.stats.averageMs.toFixed(2)} ms · p95 ${this.stats.p95Ms.toFixed(2)} ms · JS render ${this.stats.cpuMs.toFixed(2)} ms · ${this.framesWithPose} tracked frames · ${this.controllers.grab?.state??'idle'} · input/debug ${this.controllers.inputMs.toFixed(3)} ms · ${this.rig.workspaceRoot.scale.x.toFixed(4)} m / model unit`;
   this.metrics.dataset.frames=String(this.stats.frames);this.metrics.dataset.fps=String(this.stats.fps);this.sourceInfo.textContent=this.controllers.describe();
  }
 }
 refreshSculptureInfo():void{this.sculpture=this.hooks.sculptureInfo?.()??this.sculpture;}
 private editMetrics():XREditMetrics|undefined{const layers=this.hooks.layers?.(),tools=this.hooks.tools;if(!layers||!tools)return;const m=layers.metrics;
  const heap=(performance as Performance&{memory?:{usedJSHeapSize?:number}}).memory?.usedJSHeapSize;
  const runtime=layers.active,v=runtime.volume,b=v.bounds;
  return {stability:this.hooks.stability?.(),move:this.move?{milliseconds:this.move.lastMs,p95:m.movePreview.summary().p95,vertices:this.move.preview.affectedVertices,chunks:this.move.preview.affectedChunks,active:this.move.active,committing:layers.deforming,commitMs:layers.lastMoveStats?.wallMs??null,commitVoxels:layers.lastMoveStats?.changedVoxels??0}:undefined,allocation:{dimensions:v.dimensions.join('×'),bounds:b.min.map(n=>n.toFixed(1)).join(',')+' → '+b.max.map(n=>n.toFixed(1)).join(','),samples:v.dimensions.reduce((a,b)=>a*b,1),chunks:runtime.mesher.allocatedChunks,storageBytes:v.dimensions.reduce((a,b)=>a*b,1)*8,expansions:runtime.expansions,lastMs:runtime.lastExpansionMs},tool:tools.active,radius:tools.brushRadius,brush:m.brush.summary(),remesh:m.remesh.summary(),path:m.path.summary(),stroke:m.stroke.summary(),xrStroke:m.xrStroke.summary(),pendingChunks:layers.pendingChunks,replayRemaining:this.clay?.session.replayRemaining??0,memory:m.memory(layers.trackedBytes,heap)};
 }
 finishFrame(cpuMs:number):void{this.stats.cpuMs=cpuMs;const time=performance.now();if(this.performancePanel.enabled&&this.session.state==='presenting'&&time-this.lastPerformance>=500){this.lastPerformance=time;const render=this.renderer.info.render,edit=this.editMetrics();this.renderMetrics.textContent=`Last frame: ${render.calls} draw calls · ${render.triangles.toLocaleString()} rendered triangles · active ${this.sculpture.activeResolution} · visible meshes ${this.sculpture.layerMeshes} layer / ${this.sculpture.compositeMeshes} composite · peak ${this.stats.maxMs.toFixed(2)} ms · median ${this.stats.medianMs.toFixed(2)} · p99 ${this.stats.p99Ms?.toFixed(2)??'n/a'} ms · spikes ${this.stats.recentSpikes} recent / ${this.stats.spikes} session${edit?` · ${edit.tool} radius ${edit.radius.toFixed(3)} · brush ${edit.brush.latest.toFixed(2)} ms · remesh ${edit.remesh.latest.toFixed(2)} ms · dirty ${edit.pendingChunks} / replay ${edit.replayRemaining}`:''}`;this.performancePanel.paint(time,{edit,medianMs:this.stats.medianMs,p99Ms:this.stats.p99Ms,sampleCount:this.stats.sampleCount,recentSpikes:this.stats.recentSpikes,fps:this.stats.fps,averageMs:this.stats.averageMs,latestMs:this.stats.latestMs,maxMs:this.stats.maxMs,p95Ms:this.stats.p95Ms,spikes:this.stats.spikes,cpuMs,inputMs:this.controllers.inputMs,calls:render.calls,triangles:render.triangles,sculpture:this.sculpture});}}
}
