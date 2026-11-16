import {
  type Box3,
  type DirectionalLight,
  Mesh,
  type OrthographicCamera,
  PCFSoftShadowMap,
  Sphere,
  Vector3,
  type WebGLRenderer,
} from "three";

/** Inspection has its own transient shadow choice while it overrides the rig. */
export function shouldCastKeyShadow(
  rigEnabled: boolean,
  keyShadowsEnabled: boolean,
  inspectionEnabled: boolean,
  inspectionShadowsEnabled: boolean,
): boolean {
  return inspectionEnabled ? inspectionShadowsEnabled : rigEnabled && keyShadowsEnabled;
}

/** Display-only Key shadow setup. It never touches source geometry or export data. */
export function applyKeyShadowState(
  renderer: WebGLRenderer,
  lights: readonly [DirectionalLight, DirectionalLight, DirectionalLight],
  roots: readonly { traverse(callback: (object: import("three").Object3D) => void): void }[],
  enabled: boolean,
): void {
  renderer.shadowMap.type = PCFSoftShadowMap;
  lights[0].castShadow = enabled;
  lights[1].castShadow = false;
  lights[2].castShadow = false;
  if (renderer.shadowMap.enabled === enabled) return;
  renderer.shadowMap.enabled = enabled;
  for (const root of roots)
    root.traverse((object) => {
      if (object instanceof Mesh) object.receiveShadow = enabled;
    });
}

/** Fit a bounded orthographic depth camera around visible sculpt bounds. */
export function fitKeyShadowFrustum(
  light: DirectionalLight,
  bounds: Box3,
  orbitTarget?: Vector3,
): number {
  if (bounds.isEmpty()) return 0;
  const position = light.position,
    centre = bounds.getCenter(new Vector3()),
    boundRadius = bounds.getBoundingSphere(new Sphere()).radius,
    radius = Math.max(
      0.25,
      centre.distanceTo(position) + boundRadius,
      orbitTarget
        ? centre.distanceTo(orbitTarget) + position.distanceTo(orbitTarget) + boundRadius
        : 0,
    ),
    shadow = light.shadow,
    camera = shadow.camera as OrthographicCamera;
  shadow.mapSize.set(1024, 1024);
  shadow.bias = -0.0001;
  shadow.normalBias = 0.02;
  camera.left = -radius;
  camera.right = radius;
  camera.top = radius;
  camera.bottom = -radius;
  camera.near = 0.01;
  camera.far = radius * 2 + 0.1;
  camera.updateProjectionMatrix();
  shadow.needsUpdate = true;
  return radius;
}
