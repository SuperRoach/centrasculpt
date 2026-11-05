// Reproducible local recipe example. Writes the normal native project and validated mm parts.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHeadlessEditor } from "./headless-enclosure.mjs";

const { DEFAULT_ENCLOSURE } = await import("../work/test-build/enclosure-recipe.mjs");
const { saveSculptProject } = await import("../work/test-build/project.mjs");
const { exportPartSTL } = await import("../work/test-build/assembly-tools.mjs");
const { layers, api } = createHeadlessEditor();
const directory = process.argv[2] ?? "work/phase-7-1/example";
try {
  const revision = api.revision;
  const preview = await api.enclosure.create(DEFAULT_ENCLOSURE, {
    expectedRevision: revision,
    dryRun: true,
  });
  if (!preview.ok) throw new Error(JSON.stringify(preview.error));
  const result = await api.enclosure.create(DEFAULT_ENCLOSURE, { expectedRevision: revision });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/enclosure.form`, new Uint8Array(saveSculptProject(layers.project)));
  const parts = [];
  for (const [role, id] of Object.entries(result.value.partIds)) {
    const exported = await exportPartSTL(layers, id, undefined, "high");
    writeFileSync(`${directory}/${role}-mm.stl`, new Uint8Array(exported.data));
    writeFileSync(
      `${directory}/${role}-print-report.json`,
      JSON.stringify(exported.report, null, 2),
    );
    parts.push({ role, id, report: exported.report });
  }
  console.log(
    JSON.stringify(
      {
        directory,
        parts,
        samples: api.enclosure.samples(result.value.partIds.base, result.value.partIds.lid),
      },
      null,
      2,
    ),
  );
} finally {
  layers.dispose();
}
