import type { WebGLRenderer } from "three";
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  type Group,
  OrthographicCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderTarget,
} from "three";

/** A tiny, disposable render of only the committed layer surfaces. The user's scene,
 * camera, lighting, render target, XR camera and presentation objects stay untouched. */
export async function captureProjectThumbnail(
  renderer: WebGLRenderer,
  source: Group,
): Promise<string | undefined> {
  let target: WebGLRenderTarget | undefined;
  try {
    const sculpture = source.clone(true);
    sculpture.visible = true;
    const pruneHidden = (parent: Group) => {
      for (const child of [...parent.children]) {
        if (!child.visible) {
          parent.remove(child);
          continue;
        }
        pruneHidden(child as Group);
      }
    };
    pruneHidden(sculpture);
    sculpture.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(sculpture);
    if (bounds.isEmpty()) return undefined;
    const centre = bounds.getCenter(new Vector3()),
      sphere = bounds.getBoundingSphere(new Sphere());
    const radius = Math.max(0.05, sphere.radius),
      camera = new OrthographicCamera(-radius, radius, radius, -radius, 0.01, radius * 8 + 1);
    camera.position.copy(centre).add(new Vector3(2, 1.5, 3).normalize().multiplyScalar(radius * 4));
    camera.lookAt(centre);
    camera.updateProjectionMatrix();
    const scene = new Scene();
    scene.background = new Color("#dfe4e1");
    scene.add(sculpture, new AmbientLight("#ffffff", 1.35));
    const key = new DirectionalLight("#fff4df", 2.2);
    key.position.copy(centre).add(new Vector3(-2, 3, 4).multiplyScalar(radius));
    scene.add(key);
    const fill = new DirectionalLight("#d6eaff", 0.8);
    fill.position.copy(centre).add(new Vector3(3, 1, -2).multiplyScalar(radius));
    scene.add(fill);
    target = new WebGLRenderTarget(256, 256, { depthBuffer: true, stencilBuffer: false });
    const previous = renderer.getRenderTarget(),
      xrEnabled = renderer.xr.enabled,
      clearColour = new Color();
    renderer.getClearColor(clearColour);
    const clearAlpha = renderer.getClearAlpha(),
      pixels = new Uint8Array(256 * 256 * 4);
    let readPromise: Promise<Uint8Array> | undefined;
    try {
      renderer.xr.enabled = false;
      renderer.setClearColor("#dfe4e1", 1);
      renderer.setRenderTarget(target);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      const asyncRead = (
        renderer as WebGLRenderer & {
          readRenderTargetPixelsAsync?: (
            target: WebGLRenderTarget,
            x: number,
            y: number,
            width: number,
            height: number,
            buffer: Uint8Array,
          ) => Promise<Uint8Array>;
        }
      ).readRenderTargetPixelsAsync;
      if (asyncRead) readPromise = asyncRead.call(renderer, target, 0, 0, 256, 256, pixels);
      else renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);
    } finally {
      renderer.setRenderTarget(previous);
      renderer.xr.enabled = xrEnabled;
      renderer.setClearColor(clearColour, clearAlpha);
      scene.clear();
      sculpture.clear();
    }
    if (readPromise) await readPromise;
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = sourceCanvas.height = 256;
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) return undefined;
    const image = sourceContext.createImageData(256, 256);
    for (let y = 0; y < 256; y++)
      image.data.set(pixels.subarray((255 - y) * 256 * 4, (256 - y) * 256 * 4), y * 256 * 4);
    sourceContext.putImageData(image, 0, 0);
    const canvas = document.createElement("canvas"),
      sizes = [256, 192, 160, 128];
    for (const size of sizes) {
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) return undefined;
      context.drawImage(sourceCanvas, 0, 0, size, size);
      for (const mime of ["image/webp", "image/jpeg"])
        for (const quality of [0.82, 0.62, 0.42, 0.24]) {
          const data = canvas.toDataURL(mime, quality);
          if (data.length <= 32768 && /^data:image\/(png|jpeg|webp);base64,/.test(data))
            return data;
        }
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    target?.dispose();
  }
}
