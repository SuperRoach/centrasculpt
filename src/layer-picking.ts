import type { Raycaster } from "three";
import type { IndependentLayers } from "./independent-layers";

/** Pick source geometry without changing selection. Hidden/locked sources (including
 * inherited group flags) never intercept selection, even in Boolean preview. */
export function pickEditableLayer(ray: Raycaster, layers: IndependentLayers) {
  const surfaces = layers.project.layerStack.layers
    .filter((layer) => layer.editable)
    .map((layer) => layers.runtime(layer.id).surface.group);
  for (const surface of surfaces) surface.updateWorldMatrix(true, true);
  for (const hit of ray.intersectObjects(surfaces, true)) {
    let object = hit.object;
    if (!object.visible) continue;
    while (object.parent && typeof object.userData.layerId !== "string") {
      object = object.parent;
      if (!object.visible) break;
    }
    const id = object.userData.layerId;
    if (id && object.visible) return { layerId: id as string, distance: hit.distance };
  }
  return null;
}
