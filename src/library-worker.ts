import { importNative } from "./library-codec";
import { openSculptProject } from "./project";
import { projectTransfer } from "./project-transfer";
import { newProjectData } from "./project-workflow";

self.onmessage = ({ data: request }) => {
  try {
    if (request.kind === "decode") {
      const snapshot = projectTransfer(openSculptProject(request.data));
      self.postMessage(
        { result: { snapshot } },
        {
          transfer: [
            ...new Set([
              ...snapshot.layers.map((l) => l.values.buffer),
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
        ? importNative(request.data, request.name)
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
