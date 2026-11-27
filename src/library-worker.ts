import { importNative } from "./library-codec";
import { isCanonicalProjectVersion, openSculptProject } from "./project";
import { projectFieldBuffers, projectTransfer } from "./project-transfer";
import { newProjectData } from "./project-workflow";

self.onmessage = ({ data: request }) => {
  try {
    const progress = (completed: number, total: number) =>
      self.postMessage({ progress: { completed, total } });
    if (request.kind === "decode") {
      const project = openSculptProject(request.data, progress);
      const nativeBudget = isCanonicalProjectVersion(new DataView(request.data).getUint32(8, true));
      const snapshot = projectTransfer(project);
      self.postMessage(
        { result: { snapshot, nativeBudget } },
        {
          transfer: [
            ...new Set([
              ...projectFieldBuffers(snapshot),
              ...(snapshot.displayPreferences?.references?.map(
                (r) => r.bytes.buffer as ArrayBuffer,
              ) ?? []),
            ]),
          ],
        },
      );
      return;
    }
    const result =
      request.kind === "import"
        ? importNative(request.data, request.name, progress)
        : { data: newProjectData(request.resolution, request.contents, request.settings) };
    self.postMessage({ result }, { transfer: [result.data] });
  } catch (error) {
    self.postMessage({
      error: {
        code: "invalid",
        message: error instanceof Error ? error.message : "Invalid native project",
      },
    });
  }
};
