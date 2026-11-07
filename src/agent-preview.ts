import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  Sphere,
  Vector3,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import type { AgentJob } from "./agent-access";
import type { IndependentLayers } from "./independent-layers";

export const PREVIEW_MAX_BYTES = 524288;
export const previewDirections = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0],
  isometric: [2, 1.5, 3],
} as const;
export function previewCamera(
  bounds: Box3,
  width: number,
  height: number,
  view: keyof typeof previewDirections,
) {
  if (
    bounds.isEmpty() ||
    ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
  )
    throw new Error("Empty or invalid measured mesh bounds.");
  const centre = bounds.getCenter(new Vector3());
  const radius = Math.max(0.00001, bounds.getBoundingSphere(new Sphere()).radius) * 1.12;
  const aspect = width / height;
  const halfY = radius * Math.max(1, 1 / aspect);
  const camera = new OrthographicCamera(
    -halfY * aspect,
    halfY * aspect,
    halfY,
    -halfY,
    radius / 100,
    radius * 8,
  );
  camera.position
    .copy(centre)
    .add(new Vector3(...previewDirections[view]).normalize().multiplyScalar(radius * 4));
  if (view === "top") camera.up.set(0, 0, -1);
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/** No source evaluation, user camera changes, textures or presentation objects. */
export async function captureScenePreview(
  renderer: WebGLRenderer,
  editor: () => IndependentLayers,
  blocked: () => boolean,
  job: AgentJob,
  signal: AbortSignal,
) {
  const layers = editor(),
    revision = layers.modellingRevision;
  const fail = (code: string, message: string) => ({
    ok: false as const,
    revision,
    error: { code, message },
  });
  const guard = () => {
    if (signal.aborted || Date.now() >= job.deadline)
      throw new Error("cancelled: capture deadline or connection ended");
    if (editor() !== layers || layers.modellingRevision !== revision)
      throw new Error("stale_revision: editor or scene changed");
    if (
      blocked() ||
      renderer.xr.isPresenting ||
      layers.modellingBusy ||
      layers.drawing ||
      layers.transforming ||
      !layers.recoveryReady
    )
      throw new Error("busy: finish editor operations and leave XR before capture");
    if (renderer.getContext().isContextLost())
      throw new Error("context_lost: WebGL is unavailable");
  };
  let target: WebGLRenderTarget | undefined;
  const material = new MeshStandardMaterial({ color: "#aebcb3", roughness: 0.72, metalness: 0 });
  const scene = new Scene(),
    model = new Group();
  try {
    guard();
    const { width = 384, height = 384, viewpoint = "isometric", expectedRevision } = job.args;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      (width as number) < 64 ||
      (height as number) < 64 ||
      (width as number) > 512 ||
      (height as number) > 512 ||
      !(typeof viewpoint === "string" && Object.hasOwn(previewDirections, viewpoint)) ||
      Object.keys(job.args).some(
        (k) => !["width", "height", "viewpoint", "expectedRevision"].includes(k),
      )
    )
      return fail(
        "invalid_input",
        "Use 64–512 integer pixels and a supported viewpoint; whole scene only.",
      );
    if (expectedRevision !== undefined && expectedRevision !== revision)
      return fail("stale_revision", "Query the current revision before capture.");
    if (layers.pendingChunks || layers.display.assemblyPreview)
      return fail(
        "render_pending",
        "Source meshing or assembly preview is active; no capture returned.",
      );
    const composite = layers.viewMode === "boolean";
    const hasOperations = layers.project.layerStack.layers.some(
      (l) => l.booleanModifiers?.length || l.array?.enabled || l.operation !== "union",
    );
    if (!composite && hasOperations)
      return fail(
        "not_evaluated",
        "Switch the editor to Boolean preview and wait for evaluation. Separate source surfaces would misrepresent live operations.",
      );
    if (
      composite &&
      (layers.composite.pending ||
        layers.composite.busy ||
        layers.composite.failed ||
        !layers.composite.stats)
    )
      return fail(
        "render_pending",
        "Evaluated display is pending, failed or unavailable; no stale image returned.",
      );
    const sources = composite
      ? [layers.composite.group]
      : layers.project.layerStack.layers
          .filter((l) => l.visible)
          .map((l) => layers.runtime(l.id).surface.group);
    let triangles = 0,
      meshes = 0;
    for (const source of sources) {
      source.updateWorldMatrix(true, true);
      source.traverseVisible((object) => {
        if (!(object instanceof Mesh)) return;
        const count = object.geometry.getAttribute("position")?.count ?? 0;
        if (!count) return;
        triangles += (object.geometry.index?.count ?? count) / 3;
        if (++meshes > 4096 || triangles > 600000)
          throw new Error("resource_limit: display exceeds 4096 meshes or 600000 triangles");
        const mesh = new Mesh(object.geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(object.matrixWorld);
        mesh.frustumCulled = false;
        model.add(mesh);
      });
    }
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model, true);
    if (!meshes || bounds.isEmpty())
      return fail("empty_scene", "No visible committed model surfaces.");
    const w = width as number,
      h = height as number;
    const camera = previewCamera(bounds, w, h, viewpoint as keyof typeof previewDirections);
    scene.background = new Color("#dfe4e1");
    scene.add(model, new AmbientLight(0xffffff, 1.5));
    const key = new DirectionalLight(0xffffff, 2.5);
    key.position.copy(camera.position);
    key.target.position.copy(bounds.getCenter(new Vector3()));
    scene.add(key, key.target);
    target = new WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false });
    const previous = renderer.getRenderTarget(),
      colour = renderer.getClearColor(new Color()),
      alpha = renderer.getClearAlpha();
    const viewport = renderer.getViewport(new Vector4()),
      scissor = renderer.getScissor(new Vector4()),
      scissorTest = renderer.getScissorTest();
    const pixels = new Uint8Array(w * h * 4);
    guard();
    try {
      renderer.setRenderTarget(target);
      renderer.setScissorTest(false);
      renderer.setClearColor("#dfe4e1", 1);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.setClearColor(colour, alpha);
    }
    guard();
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("unavailable: PNG encoder unavailable");
      const image = context.createImageData(w, h);
      for (let y = 0; y < h; y++)
        image.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve, reject) => {
        const abort = () => finish(new Error("cancelled: PNG encoding interrupted"));
        const timer = setTimeout(abort, Math.max(0, job.deadline - Date.now()));
        const finish = (error?: Error, value?: Blob | null) => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve(value ?? null);
        };
        signal.addEventListener("abort", abort, { once: true });
        try {
          canvas.toBlob((value) => finish(undefined, value), "image/png");
        } catch {
          finish(new Error("encoding_failed: PNG encoder threw"));
        }
        if (signal.aborted) abort();
      });
      guard();
      if (!blob || blob.type !== "image/png" || blob.size > PREVIEW_MAX_BYTES)
        return fail(
          "resource_limit",
          "PNG exceeds 512 KiB or encoding failed; request fewer pixels.",
        );
      return {
        ok: true as const,
        revision,
        blob,
        value: {
          mimeType: blob.type,
          bytes: blob.size,
          width: w,
          height: h,
          viewpoint,
          projectId: layers.project.id,
          revision,
          capturedAt: new Date().toISOString(),
          geometry: composite ? "evaluated-live-display" : "committed-source-surfaces",
          renderState: "current",
          scope: "all-visible-model-surfaces",
          visibleSourceIds: layers.project.layerStack.layers
            .filter((l) => l.visible)
            .map((l) => l.id),
          millimetresPerModelUnit: layers.display.precision.millimetresPerUnit,
          camera: {
            projection: "orthographic",
            position: camera.position.toArray(),
            up: camera.up.toArray(),
            target: bounds.getCenter(new Vector3()).toArray(),
          },
          material: "neutral-untextured",
          bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), units: "render-world" },
          triangles,
          meshes,
          sampling: composite ? { ...layers.composite.stats } : null,
          warnings: [
            "Display sampling can omit fine features. Screenshots cannot establish watertightness, exact dimensions or physical fit. Use get_geometry_diagnostics.",
            "References, textures, UI, guides and agent overlays excluded. Locked visible surfaces included. Per-object/part isolation is unsupported.",
          ],
        },
      };
    } finally {
      canvas.width = canvas.height = 0;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message.split(":")[0], message);
  } finally {
    target?.dispose();
    material.dispose();
    model.clear();
    scene.clear();
  }
}
