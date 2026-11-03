import type { IndependentLayers } from "./independent-layers";
/** Presentation only: retain the user's view choice and wait for fresh Boolean geometry. */
export class TransformPreview {
  private owner: IndependentLayers | null = null;
  private separate = false;
  sync(layers: IndependentLayers): void {
    if (this.owner !== layers) {
      this.owner = layers;
      this.separate = false;
    }
    if (layers.viewMode !== "boolean") this.separate = false;
    else if (layers.transforming) this.separate = true;
    else if (this.separate) {
      layers.composite.syncMetadata();
      if (!layers.composite.pending && !layers.composite.busy && !layers.composite.failed)
        this.separate = false;
    }
    const boolean = layers.viewMode === "boolean" && !this.separate;
    layers.group.visible = !boolean;
    layers.composite.group.visible = boolean && !layers.composite.failed;
  }
}
