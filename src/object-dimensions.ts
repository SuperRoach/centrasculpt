import { Box3, Mesh, Vector3 } from "three";
import type { IndependentLayers } from "./independent-layers";
import { transformMatrix, type Vec3 } from "./transform";
/** Read committed mesh positions without updating selection, pose or sculpt data. */
export function objectDimensions(layers: IndependentLayers, id: string): Vec3 {
  if (!layers.recoveryReady)
    throw new Error("Wait for completed geometry before measuring dimensions.");
  const hierarchy = layers.project.layerStack.hierarchy;
  const ids = new Set([id, ...hierarchy.descendants(id)]);
  const bounds = new Box3(),
    point = new Vector3();
  for (const layer of layers.project.layerStack.layers) {
    if (!ids.has(layer.id)) continue;
    const matrix = transformMatrix(layer.transform);
    layers.runtime(layer.id).surface.group.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const positions = object.geometry.getAttribute("position");
      if (!positions) return;
      for (let i = 0; i < positions.count; i++)
        bounds.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(matrix));
    });
  }
  if (bounds.isEmpty()) return [0, 0, 0];
  return bounds.getSize(point).toArray() as Vec3;
}
