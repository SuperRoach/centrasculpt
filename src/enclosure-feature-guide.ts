import type { FeatureDefinition } from "./enclosure-features";
import type { EnclosureParameters } from "./enclosure-recipe";

/** Live orthographic view of the wall opening or the floor mounting layout. */
export function enclosureFeatureGuide(place: (u: number, v: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 244;
  canvas.className = "enclosure-feature-guide";
  const ctx = canvas.getContext("2d");
  let signature = "";
  let wall: { left: number; top: number; width: number; height: number; scale: number } | undefined;
  canvas.addEventListener("click", (event) => {
    if (!wall) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * canvas.width) / rect.width - wall.left;
    const y = ((event.clientY - rect.top) * canvas.height) / rect.height - wall.top;
    if (x < 0 || x > wall.width || y < 0 || y > wall.height) return;
    place((x - wall.width / 2) / wall.scale, (wall.height - y) / wall.scale);
  });
  return {
    canvas,
    draw(p: EnclosureParameters, feature: FeatureDefinition, valid: boolean, editable: boolean) {
      const key = JSON.stringify([p, feature, valid, editable]);
      if (!ctx || key === signature) return;
      signature = key;
      wall = undefined;
      const cut = feature.kind === "cutout";
      canvas.setAttribute(
        "aria-label",
        cut
          ? "Wall elevation. Use Across wall and Above floor to position the opening."
          : "Inside floor seen from above. Numbered circles mark the mounting posts.",
      );
      const w =
        cut && (feature.anchor.endsWith("right") || feature.anchor.endsWith("left"))
          ? p.innerDepthMm
          : p.innerWidthMm;
      const h = cut ? p.innerHeightMm : p.innerDepthMm;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h))) return;
      const scale = Math.min(372 / w, 158 / h);
      const width = w * scale;
      const height = h * scale;
      const left = (canvas.width - width) / 2;
      const top = 37 + (158 - height) / 2;
      const x = (u: number) => left + width / 2 + u * scale;
      const y = (v: number) => (cut ? top + height - v * scale : top + height / 2 + v * scale);
      const rect = () => ctx.rect(left, top, width, height);
      ctx.fillStyle = "#53644d";
      ctx.font = "600 18px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(cut ? "Outside view of wall" : "Inside floor · top view", 240, 24);
      ctx.beginPath();
      rect();
      ctx.fillStyle = "#e6ecdf";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#84917a";
      ctx.stroke();
      ctx.save();
      ctx.clip();
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(x(0), top);
      ctx.lineTo(x(0), top + height);
      if (!cut) {
        ctx.moveTo(left, y(0));
        ctx.lineTo(left + width, y(0));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = valid ? "#187457" : "#ad4a34";
      ctx.fillStyle = valid ? "#adddc2" : "#edc7b9";
      if (feature.kind === "cutout") {
        if (editable) wall = { left, top, width, height, scale };
        const outline = (outset: number) => {
          if (!(feature.widthMm > 0 && feature.heightMm > 0)) return;
          const cx = x(feature.uMm),
            cy = y(feature.vMm);
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
          ctx.beginPath();
          if (feature.shape === "round") {
            ctx.arc(cx, cy, (feature.widthMm / 2 + outset) * scale, 0, 2 * Math.PI);
          } else {
            const dw = (feature.widthMm + 2 * outset) * scale;
            const dh = (feature.heightMm + 2 * outset) * scale;
            ctx.roundRect(
              cx - dw / 2,
              cy - dh / 2,
              dw,
              dh,
              Math.max(0, feature.cornerRadiusMm ?? 0) * scale,
            );
          }
        };
        const flare = feature.outsideFlareMm ?? 0;
        outline(0);
        ctx.fill();
        ctx.stroke();
        if (flare > 0) {
          outline(flare);
          ctx.setLineDash([5, 4]);
          ctx.stroke();
        }
      } else {
        const ring = (size: number) => Math.max(0, (size * scale) / 2);
        feature.centresMm.forEach(([u, v], i) => {
          if (!Number.isFinite(u) || !Number.isFinite(v) || !(feature.outerDiameterMm > 0)) return;
          ctx.beginPath();
          ctx.arc(x(u), y(v), ring(feature.outerDiameterMm), 0, 2 * Math.PI);
          ctx.fillStyle = valid ? "#adddc2" : "#edc7b9";
          ctx.fill();
          ctx.stroke();
          if (feature.boreDiameterMm > 0) {
            ctx.beginPath();
            ctx.arc(x(u), y(v), ring(feature.boreDiameterMm), 0, 2 * Math.PI);
            ctx.stroke();
          }
          ctx.fillStyle = "#244b3a";
          ctx.font = "600 15px system-ui";
          ctx.fillText(String(i + 1), x(u), y(v) + 5);
        });
      }
      ctx.restore();
      ctx.fillStyle = "#53644d";
      ctx.font = "16px system-ui";
      ctx.fillText(
        cut
          ? feature.outsideFlareMm
            ? "Dashed line shows the outside opening"
            : "Inside floor level"
          : "Front wall",
        240,
        224,
      );
      canvas.style.cursor = wall ? "crosshair" : "";
    },
  };
}
