export type ToolHand='left'|'right';
export type ControllerRole='tool'|'support'|'unassigned';
/** Planned bindings only; no controller event can execute an editing command. */
export const FUTURE_XR_BINDINGS=Object.freeze({trigger:'sculpt',grip:'workspace-or-layer-grab',thumbstick:'brush-or-shape-size'} as const);
export const PLANNED_XR_ACTIONS=Object.freeze({tool:Object.freeze({trigger:'sculpt-stamp-apply',grip:'grab-selected-layer',thumbstick:'brush-shape-size',face:'tools-menus'}),support:Object.freeze({grip:'grab-workspace',thumbstick:'undo-redo-or-selection',face:'tools-menus'}),bothGrips:'two-hand-manipulation'} as const);
export class XRControllerRoles {
 dominant:ToolHand='right';
 setDominant(hand:unknown):void{if(hand!=='left'&&hand!=='right')throw new Error('Tool hand must be left or right.');this.dominant=hand;}
 get support():ToolHand{return this.dominant==='right'?'left':'right';}
 roleFor(hand:XRHandedness):ControllerRole{return hand==='none'?'unassigned':hand===this.dominant?'tool':'support';}
 bindingsFor(hand:XRHandedness){const role=this.roleFor(hand);return role==='unassigned'?undefined:PLANNED_XR_ACTIONS[role];}
 describe(sources:Iterable<XRInputSource>):string{return [...sources].map(source=>`${source.handedness}: ${this.roleFor(source.handedness)} (${source.profiles.join(', ')||'generic XR input'})`).join(' · ')||'No tracked input sources yet. Controllers are not editing-enabled.';}
}
