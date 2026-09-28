import "server-only";

import { prisma } from "@/lib/config/prisma";
import { type CreateDeviceInput } from "@/lib/devices/schema";

export const deviceMutations = {
  create: (input: CreateDeviceInput & { ownerId: string }) =>
    prisma.device.create({ data: input, select: { id: true } }),

  rename: (id: string, ownerId: string, name: string) =>
    prisma.device.updateMany({ where: { id, ownerId }, data: { name } }),

  remove: (id: string, ownerId: string) =>
    prisma.device.deleteMany({ where: { id, ownerId } }),
};
