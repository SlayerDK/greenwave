import "server-only";

import { requireAuth } from "@/lib/auth/session";
import { deviceQueries } from "@/lib/devices/queries";
import {
  serializeDevice,
  type SerializedDevice,
} from "@/lib/devices/serialization";

export const getDevices = async (): Promise<SerializedDevice[]> => {
  const { user } = await requireAuth();
  const devices = await deviceQueries.listByOwner(user.id);

  return devices.map(serializeDevice);
};

export const getDevice = async (
  id: string,
): Promise<SerializedDevice | null> => {
  const { user } = await requireAuth();
  const device = await deviceQueries.findByIdForOwner(id, user.id);

  return device ? serializeDevice(device) : null;
};
