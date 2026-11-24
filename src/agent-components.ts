import {
  componentOpening,
  type OpeningMeasurements,
  openingIsStale,
  suggestedOpeningWall,
} from "./component-openings";
import {
  COMPONENT_PRESETS,
  type ComponentPreset,
  type ComponentReference,
  componentHoles,
  functionalFeatures,
  validateComponents,
} from "./component-references";
import { componentEnvelope, componentMounting } from "./component-view";
import type { WallAnchor } from "./enclosure-features";
import type { IndependentLayers } from "./independent-layers";
import { newId } from "./layers";

export type ComponentRecipe =
  | {
      type: "component-mounting";
      componentId: string;
      baseId: string;
      lidId: string;
      outerDiameterMm: number;
      boreDiameterMm: number;
    }
  | {
      type: "component-opening";
      componentId: string;
      baseId: string;
      lidId: string;
      featureId: string;
      wall?: WallAnchor;
      measurements: Omit<OpeningMeasurements, "centre" | "width" | "height" | "plunger"> & {
        x?: number;
        y: number;
        z?: number;
        width?: number;
        height?: number;
        plunger?: Omit<NonNullable<OpeningMeasurements["plunger"]>, "length"> & { length?: number };
      };
    }
  | {
      type: "component-update";
      componentId: string;
      baseId: string;
      lidId: string;
      attachmentId: string;
    };

export function inspectComponents(editor: IndependentLayers, componentId?: string) {
  const components = editor.display.components;
  const stack = editor.project.layerStack;
  return {
    presets: Object.entries(COMPONENT_PRESETS).map(([preset, { name, dimensions, holes }]) => ({
      preset,
      name,
      dimensions,
      holes,
      features: functionalFeatures(preset as ComponentPreset),
    })),
    references: components
      .filter(({ id }) => !componentId || id === componentId)
      .map((record) => {
        const host = stack.layers.find(({ id }) => record.hostId === id);
        return {
          ...record,
          holes: componentHoles(record),
          envelope: componentEnvelope(record, host),
          features: functionalFeatures(record.preset).map((feature) => ({
            ...feature,
            suggestedWall: suggestedOpeningWall(record, feature),
          })),
        };
      }),
    openings: stack.layers.flatMap((part) =>
      (part.assemblyPart?.enclosure?.features ?? []).flatMap(({ definition, sourceIds }) => {
        if (definition.kind !== "cutout" || !definition.association) return [];
        const linked = components.find(({ id }) => id === definition.association?.componentId);
        if (componentId && definition.association.componentId !== componentId) return [];
        return [
          {
            attachmentId: sourceIds[0],
            definition,
            referenceDeleted: !linked,
            stale: openingIsStale(definition.association, linked, part),
          },
        ];
      }),
    ),
  };
}

export type ComponentEdit =
  | { type: "insert"; preset: ComponentPreset }
  | {
      type: "place";
      componentId: string;
      hostId: string | null;
      positionMm: ComponentReference["positionMm"];
      rotation: ComponentReference["rotation"];
      gapMm?: number;
    }
  | { type: "delete"; componentId: string };

export function editComponent(editor: IndependentLayers, edit: ComponentEdit) {
  const records = editor.display.components;
  if (edit.type === "insert") {
    const id = newId();
    editor.replaceComponentReferences([
      ...records,
      {
        id,
        preset: edit.preset,
        positionMm: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: 1,
        opacity: 1,
        visible: true,
      },
    ]);
    return id;
  }
  const record = records.find(({ id }) => id === edit.componentId);
  if (!record) throw new Error("Unknown component reference.");
  if (edit.type === "delete") {
    editor.replaceComponentReferences(records.filter((item) => item !== record));
    return record.id;
  }
  if (
    edit.hostId &&
    !editor.project.layerStack.layers.some(
      (layer) => layer.id === edit.hostId && layer.assemblyPart?.enclosure,
    )
  )
    throw new Error("Select an enclosure base or lid in this project.");
  const next = {
    ...record,
    hostId: edit.hostId ?? undefined,
    positionMm: edit.positionMm,
    rotation: edit.rotation,
    gapMm: edit.gapMm,
  };
  editor.replaceComponentReferences(records.map((item) => (item === record ? next : item)));
  return record.id;
}

export function planComponentFeature(editor: IndependentLayers, recipe: ComponentRecipe) {
  const record = editor.display.components.find(({ id }) => id === recipe.componentId);
  const host = editor.project.layerStack.layers.find(({ id }) => id === recipe.baseId);
  if (!record || !host || record.hostId !== host.id)
    throw new Error("Attach the component to the requested enclosure base first.");
  if (recipe.type === "component-mounting")
    return {
      definition: componentMounting(record, host, recipe.outerDiameterMm, recipe.boreDiameterMm),
    };
  const previous =
    recipe.type === "component-update"
      ? host.assemblyPart?.enclosure?.features?.find(
          ({ sourceIds }) => sourceIds[0] === recipe.attachmentId,
        )?.definition
      : undefined;
  const association = previous?.kind === "cutout" ? previous.association : undefined;
  const features = functionalFeatures(record.preset);
  if (recipe.type === "component-update") {
    if (
      previous?.kind !== "cutout" ||
      !association ||
      association.componentId !== record.id ||
      association.partId !== host.id
    )
      throw new Error("The opening must belong to this component and enclosure base.");
    const feature = features.find(({ id }) => id === association.featureId) ?? {
      id: association.featureId,
      name: "Generic connector",
      type: "port" as const,
      confidence: "user-measured" as const,
      ...association.axes,
    };
    const fit = componentOpening(
      record,
      host,
      { ...feature, ...association.axes },
      association.measurements,
      undefined,
      true,
    );
    fit.opening.name = previous.name;
    return {
      definition: fit.opening,
      plunger: fit.plunger,
      attachmentId: recipe.attachmentId,
      fit,
    };
  }
  const feature = features.find(({ id }) => id === recipe.featureId);
  if (!feature) throw new Error("Unknown functional feature for this component preset.");
  const m = recipe.measurements;
  const nominal = feature.measurements;
  const fit = componentOpening(
    record,
    host,
    feature,
    {
      ...m,
      centre: [m.x ?? nominal?.centre[0] ?? NaN, m.y, m.z ?? nominal?.centre[2] ?? NaN],
      width: m.width ?? nominal?.width ?? NaN,
      height: m.height ?? nominal?.height ?? NaN,
      plunger: m.plunger && { ...m.plunger, length: m.plunger.length ?? NaN },
    },
    recipe.wall,
  );
  return { definition: fit.opening, plunger: fit.plunger, fit };
}
