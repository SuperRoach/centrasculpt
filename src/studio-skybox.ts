import { BufferAttribute, BufferGeometry, Color, Matrix4, Mesh, ShaderMaterial } from "three";

/** Infinite, gravity-aligned background. One triangle; never part of workspace/sculpture data. */
export class StudioSkybox {
  private groundColour = "#808080";
  readonly material = new ShaderMaterial({
    uniforms: {
      inverseProjection: { value: new Matrix4() },
      viewToWorld: { value: new Matrix4() },
      ground: { value: new Color("#808080") },
      zenith: { value: new Color("#808080") },
      haze: { value: new Color("#acacac") },
    },
    vertexShader: `
      uniform mat4 inverseProjection;
      uniform mat4 viewToWorld;
      varying vec3 worldRay;
      void main() {
        vec4 ray = inverseProjection * vec4(position.xy, 1.0, 1.0);
        worldRay = mat3(viewToWorld) * (ray.xyz / ray.w);
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 ground;
      uniform vec3 zenith;
      uniform vec3 haze;
      varying vec3 worldRay;
      void main() {
        float elevation = normalize(worldRay).y;
        vec3 lower = mix(ground, haze * 0.65, 0.22 * exp(-abs(elevation) * 24.0));
        vec3 upper = mix(haze, zenith, smoothstep(0.0, 0.8, elevation));
        // A narrow continuous transition reads as distant haze, never a floor edge.
        vec3 colour = mix(lower, upper, smoothstep(-0.018, 0.018, elevation));
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  readonly geometry = new BufferGeometry().setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  readonly mesh = new Mesh(this.geometry, this.material);
  constructor() {
    this.mesh.name = "Studio skybox · display only";
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -Infinity;
    this.mesh.raycast = () => {};
    // Three invokes this with each XR eye camera. Translation is deliberately discarded.
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      this.material.uniforms.viewToWorld.value.copy(camera.matrixWorld);
      this.material.uniformsNeedUpdate = true;
    };
  }
  setGround(colour: string): void {
    if (colour === this.groundColour) return;
    this.groundColour = colour;
    this.material.uniforms.ground.value.set(colour);
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
