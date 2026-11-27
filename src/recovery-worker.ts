import { saveSculptProject } from "./project";
import { checksum } from "./project-snapshot";
import { hydrateProject } from "./project-transfer";

/** Reuses the existing native validator/serializer. Termination discards all staging. */
self.onmessage = ({ data: d }) => {
  try {
    const start = performance.now(),
      project = hydrateProject(d.snapshot);
    const data = saveSculptProject(project),
      result = { data, checksum: checksum(data), milliseconds: performance.now() - start };
    self.postMessage({ id: d.id, result }, { transfer: [data] });
  } catch (error) {
    self.postMessage({ id: d.id, error: error instanceof Error ? error.message : String(error) });
  }
};
