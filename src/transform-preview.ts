import type { IndependentLayers } from "./independent-layers";
/** Presentation only: retain the user's view choice and wait for fresh Boolean geometry. */
export class TransformPreview {
  private owner: IndependentLayers | null = null;
  private separate = false;
  sync(layers: IndependentLayers, adaptiveBoolean = false): void {
    if (adaptiveBoolean) {
      layers.composite.setInteractive(
        layers.viewMode === "boolean" &&
          (layers.transforming || layers.drawing || layers.generatingTube || layers.previewing),
      );
      if (layers.viewMode === "boolean" && !layers.composite.failed) {
        layers.group.visible = !layers.composite.stats;
        layers.composite.group.visible = !!layers.composite.stats;
        layers.syncAssemblyPreview();
        return;
      }
    }
    if (!adaptiveBoolean) layers.composite.setInteractive(false);
    if (this.owner !== layers) {
      this.owner = layers;
      this.separate = false;
    }
    const live = layers.project.layerStack.layers.some(
      (l) => l.booleanModifiers?.length || l.array?.enabled,
    );
    if (layers.viewMode !== "boolean") this.separate = false;
    else if (
      layers.transforming ||
      layers.generatingTube ||
      (live && (layers.composite.pending || layers.composite.busy || layers.composite.failed))
    )
      this.separate = true;
    else if (this.separate) {
      layers.composite.syncMetadata();
      if (!layers.composite.pending && !layers.composite.busy && !layers.composite.failed)
        this.separate = false;
    }
    const boolean = layers.viewMode === "boolean" && !this.separate;
    layers.group.visible = !boolean;
    layers.composite.group.visible = boolean && !layers.composite.failed;
    layers.syncAssemblyPreview();
  }
}
