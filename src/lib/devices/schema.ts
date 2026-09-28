import { z } from "zod";

export const createDeviceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  location: z.string().trim().max(120).optional(),
});

export const updateDeviceSchema = createDeviceSchema.extend({
  id: z.cuid(),
});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
