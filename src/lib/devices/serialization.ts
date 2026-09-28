import "server-only";

import { type Prisma } from "@/generated/prisma/client";

type DeviceFromDb = Prisma.DeviceGetPayload<{ include: { readings: true } }>;
type ReadingFromDb = DeviceFromDb["readings"][number];

export const serializeDevice = (device: DeviceFromDb) => ({
  ...device,
  createdAt: device.createdAt.toISOString(),
  updatedAt: device.updatedAt.toISOString(),
  readings: device.readings.map(serializeReading),
});

export type SerializedDevice = ReturnType<typeof serializeDevice>;

const serializeReading = (reading: ReadingFromDb) => ({
  ...reading,
  recordedAt: reading.recordedAt.toISOString(),
  temperature: reading.temperature.toNumber(),
  humidity: reading.humidity.toNumber(),
});
