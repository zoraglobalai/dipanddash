import { z } from "zod";

export const posCatalogSnapshotSchema = z.object({
  query: z.object({
    sinceVersion: z.string().trim().optional(),
    allocationDate: z.string().date().optional()
  }),
  params: z.object({}).optional(),
  body: z.object({}).optional()
});

