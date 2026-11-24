import { z } from "zod";

const triplet = z.tuple([z.number(), z.number(), z.number()]);
const length = z.number().min(0).max(1000);

export const openingAssociationSchema = z.strictObject({
  version: z.literal(1),
  componentId: z.string().min(1).max(128),
  partId: z.string().min(1).max(128),
  manuallyEdited: z.literal(true).optional(),
  printableIds: z.array(z.string().min(1).max(128)).max(4).optional(),
  featureId: z.string().min(1).max(128),
  pose: z.strictObject({
    position: triplet,
    rotation: triplet,
    scale: z.number().positive().max(10),
    dimensions: triplet.optional(),
    gap: length.optional(),
    wallThickness: length,
    partPosition: triplet.optional(),
    partRotation: triplet.optional(),
    cavity: z.tuple([length, length, length, length, length]),
  }),
  axes: z.strictObject({ outward: triplet, up: triplet }),
  measurements: z.strictObject({
    centre: triplet,
    shape: z.enum(["rectangle", "round"]),
    width: length,
    height: length,
    horizontal: length,
    vertical: length,
    cable: length,
    travel: length.optional(),
    usableDepth: length.optional(),
    plunger: z
      .strictObject({
        diameter: length,
        height: length,
        shaft: length,
        length,
        retainer: z.strictObject({ diameter: length, thickness: length }).optional(),
      })
      .optional(),
  }),
  manufacturer: z
    .strictObject({
      verification: z.literal("manufacturer-nominal"),
      model: z.string().max(128),
      revision: z.string().max(128),
      sourceUrl: z.url({ protocol: /^https$/ }).max(300),
      heightSourceUrl: z
        .url({ protocol: /^https$/ })
        .max(300)
        .optional(),
      fields: z.array(z.enum(["x", "z", "width", "height"])).max(4),
    })
    .optional(),
});

export type OpeningAssociation = z.infer<typeof openingAssociationSchema>;
