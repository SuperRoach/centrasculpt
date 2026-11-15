import {
  AmbientLight,
  DirectionalLight,
  Group,
  type Mesh,
  Quaternion,
  Scene,
  Vector3,
} from "three";
import { IndependentLayers } from "./independent-layers";
import { createBaseProject } from "./layers";
import { SDFVolume } from "./sdf";

function meshSignature(editor: IndependentLayers, volume: SDFVolume) {
  let hash = 2166136261;
  const feed = (value: number) => {
    hash = Math.imul(hash ^ value, 16777619);
  };
  const words = (array: Float32Array) => {
    feed(array.length);
    for (const word of new Uint32Array(array.buffer, array.byteOffset, array.length)) feed(word);
  };
  words(volume.values);
  for (const { id, geometry } of editor.active.mesher.snapshotUpdates()) {
    const position = geometry.getAttribute("position").array as Float32Array;
    if (!position.length) continue;
    feed(id);
    words(position);
    words(geometry.getAttribute("normal").array as Float32Array);
  }
  return hash >>> 0;
}

/** Development-only replay. The live user's editor and recovery state are separate. */
export class UndoXRReplay {
  readonly scene = new Scene();
  private readonly fixture = new Group();
  private pending?: () => void;
  private session?: XRSession;
  private started = false;
  private readonly output = document.createElement("pre");

  constructor() {
    this.scene.background = null;
    const light = new DirectionalLight(0xffffff, 2);
    light.position.set(1, 3, 2);
    this.scene.add(this.fixture, new AmbientLight(0xffffff, 2), light);
    this.fixture.scale.setScalar(0.55);
    this.output.id = "undo-xr-replay-result";
    this.output.setAttribute("role", "status");
    this.output.style.cssText =
      "position:fixed;bottom:1rem;left:1rem;z-index:1000;background:#14202a;color:white;padding:1rem;max-width:90vw;white-space:pre-wrap;pointer-events:none";
    this.output.textContent = "Undo replay armed. Enter VR to start.";
    document.body.append(this.output);
  }

  frame(session: XRSession, pose: XRViewerPose | null, trackingOrigin: Group): boolean {
    if (!this.started && pose && !pose.emulatedPosition) {
      this.started = true;
      this.session = session;
      const { position, orientation } = pose.transform;
      const rotation = new Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
      this.fixture.position.copy(
        trackingOrigin.localToWorld(
          new Vector3(position.x, position.y, position.z).add(
            new Vector3(0, 0, -1.65).applyQuaternion(rotation),
          ),
        ),
      );
      this.fixture.quaternion.copy(
        trackingOrigin.getWorldQuaternion(new Quaternion()).multiply(rotation),
      );
      void this.run(session)
        .catch((error: unknown) => {
          this.output.textContent = `Undo replay stopped. ${String(error)}`;
        })
        .finally(() => {
          this.session = undefined;
        });
    }
    return this.session === session;
  }

  afterDraw(): void {
    this.pending?.();
  }

  private nextDraw(session: XRSession): Promise<number> {
    return new Promise((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer);
        session.removeEventListener("end", ended);
        this.pending = undefined;
      };
      const ended = () => {
        finish();
        reject(new Error("VR session ended"));
      };
      const timer = setTimeout(() => {
        finish();
        reject(new Error("No tracked frame arrived within five seconds"));
      }, 5000);
      this.pending = () => {
        finish();
        resolve(performance.now());
      };
      session.addEventListener("end", ended, { once: true });
    });
  }

  private async run(session: XRSession): Promise<void> {
    const results = [];
    let expected: { before: number; edited: number } | undefined;
    for (const cache of [false, true, true, false]) {
      this.output.textContent = `Undo replay ${results.length + 1}/4. Keep looking at the sculpt.`;
      const volume = new SDFVolume(97);
      const editor = new IndependentLayers(
        createBaseProject(volume, {
          mode: "subtract",
          radius: 0.45,
          strength: 0.85,
          hardness: 0.6,
          camera: { position: [0, 0, 3], target: [0, 0, 0] },
        }),
      );
      this.fixture.add(editor.group);
      try {
        editor.setUndoMeshCacheEnabled(cache);
        const before = meshSignature(editor, volume);
        for (let frame = 0; frame < 12; frame++) await this.nextDraw(session);
        editor.beginStroke();
        for (let sample = 0; sample < 48; sample++) {
          await this.nextDraw(session);
          editor.applyStrokeLocal(
            { x: -0.65 + (1.3 * sample) / 47, y: 0.02, z: 0.72 },
            0.45,
            "subtract",
            0.85,
            1 / 72,
            0.6,
          );
          if (sample % 2 === 1) editor.active.rebuild();
        }
        editor.finishStroke();
        const edited = meshSignature(editor, volume);
        if (
          before === edited ||
          (expected && (before !== expected.before || edited !== expected.edited))
        )
          throw new Error("Replay input parity failed");
        expected = { before, edited };
        const retainedBytes = editor.undoMeshCacheBytes;
        if (cache !== retainedBytes > 0) throw new Error("Unexpected cache admission");

        await this.nextDraw(session);
        const surface = editor.active.surface.group;
        const previous = new Set(surface.children.map((child) => (child as Mesh).geometry));
        const undoStart = performance.now();
        if (!editor.undo()) throw new Error("Replay produced no Undo entry");
        const undoCpuMs = performance.now() - undoStart;
        const pending = new Set(
          surface.children
            .map((child) => child as Mesh)
            .filter((mesh) => !previous.has(mesh.geometry)),
        );
        const changedMeshes = pending.size;
        for (const mesh of pending)
          mesh.onAfterRender = () => {
            pending.delete(mesh);
          };
        let firstSubmissionMs: number | null = null;
        let fullSubmissionMs: number | null = null;
        for (let frame = 0; frame < 12; frame++) {
          const drawEnd = await this.nextDraw(session);
          if (firstSubmissionMs === null && (changedMeshes === 0 || pending.size < changedMeshes))
            firstSubmissionMs = drawEnd - undoStart;
          if (!pending.size) {
            fullSubmissionMs = drawEnd - undoStart;
            break;
          }
        }
        if (meshSignature(editor, volume) !== before) throw new Error("Undo parity failed");
        editor.undo(true);
        if (meshSignature(editor, volume) !== edited) throw new Error("Redo parity failed");
        results.push({
          cache,
          retainedBytes,
          undoCpuMs,
          firstSubmissionMs,
          fullSubmissionMs,
          changedMeshes,
          unsubmittedMeshes: pending.size,
        });
      } finally {
        this.fixture.remove(editor.group);
        editor.dispose();
      }
    }
    const report = { frameRate: session.frameRate ?? null, results };
    this.output.textContent = JSON.stringify(report, null, 2);
    console.info("Centra Undo XR replay", report);
  }
}
