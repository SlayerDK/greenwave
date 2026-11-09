import "server-only";

import { prisma } from "@/lib/config/prisma";

export const deviceQueries = {
  listByOwner: (ownerId: string) =>
    prisma.device.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      include: {
        readings: { orderBy: { recordedAt: "desc" }, take: 1 },
      },
    }),

  findByIdForOwner: (id: string, ownerId: string) =>
    prisma.device.findFirst({
      where: { id, ownerId },
      include: {
        readings: { orderBy: { recordedAt: "desc" }, take: 50 },
      },
    }),
};
