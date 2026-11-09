import { type Box3, type PerspectiveCamera, Vector3 } from "three";

export type AgentNavigation = {
  target: Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => unknown;
};
/** An explicit desktop navigation action, never a modelling command or selection edit. */
export function frameAgentBounds(
  camera: PerspectiveCamera,
  controls: AgentNavigation,
  box: Box3,
): void {
  const centre = box.getCenter(new Vector3()),
    radius = Math.max(box.getSize(new Vector3()).length() / 2, 1e-5);
  const vertical = (camera.fov * Math.PI) / 180,
    horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  const distance = (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.15;
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-12) direction.set(2.4, 1.7, 3.3);
  direction.normalize();
  controls.minDistance = Math.min(controls.minDistance, distance * 0.8);
  controls.maxDistance = Math.max(controls.maxDistance, distance * 1.2);
  camera.near = Math.min(camera.near, Math.max(1e-7, (distance - radius) / 2));
  camera.far = Math.max(camera.far, distance + radius * 2);
  camera.updateProjectionMatrix();
  controls.target.copy(centre);
  camera.position.copy(centre).addScaledVector(direction, distance);
  camera.lookAt(centre);
  controls.update();
}
