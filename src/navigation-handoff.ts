import {Matrix4} from 'three';
import type {Object3D} from 'three';
import type {XRInteractionState} from './workspace-grab';
export type NavigationParticipant={connectionId:number;gripWorld:Matrix4};
export type NavigationHandoff={from:XRInteractionState;workspaceWorld:Matrix4;participants:readonly NavigationParticipant[]};
/** Explicit boundary snapshot for a future gesture owner. Does not transition or implement dual-hand motion. */
export function captureNavigationHandoff(workspace:Object3D,from:XRInteractionState,participants:readonly NavigationParticipant[]):NavigationHandoff{
 if(!participants.length||participants.some((p,i)=>!Number.isInteger(p.connectionId)||p.connectionId<=0||participants.some((q,j)=>j!==i&&q.connectionId===p.connectionId)||!p.gripWorld.elements.every(Number.isFinite)||Math.abs(p.gripWorld.determinant())<1e-10))throw new Error('Handoff requires unique tracked grip poses.');
 workspace.updateWorldMatrix(true,false);return {from,workspaceWorld:workspace.matrixWorld.clone(),participants:participants.map(p=>({connectionId:p.connectionId,gripWorld:p.gripWorld.clone()}))};
}
