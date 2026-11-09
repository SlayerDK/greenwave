import { z } from "zod";

export const adapterStatusSchema = z.object({
  status: z.enum(["online", "offline"]),
  at: z.iso.datetime(),
});

export type AdapterStatus = z.infer<typeof adapterStatusSchema>;

const statusMessage = (status: AdapterStatus["status"], at: Date) =>
  JSON.stringify({ status, at: at.toISOString() } satisfies AdapterStatus);

export const onlineStatus = (at = new Date()) => statusMessage("online", at);

/**
 * Also the adapter's Last Will, which is registered at connect time: there,
 * `at` is when the will was set, not when the adapter died.
 */
export const offlineStatus = (at = new Date()) => statusMessage("offline", at);
