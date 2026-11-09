-- CreateEnum
CREATE TYPE "traffic_route_status" AS ENUM ('NEW', 'ACTIVE', 'PENDING_UPDATE', 'MM_FAILED', 'ARCHIVED');

-- AlterTable
--
-- Hand-edited: Prisma's generated version dropped and re-added the column, which
-- cannot run against a table that already holds rows. Every value ever written
-- to this column came from the `routeStatus` Zod enum, whose members are exactly
-- the labels above, so an in-place USING cast is lossless.
ALTER TABLE "traffic_route"
  ALTER COLUMN "status" TYPE "traffic_route_status"
  USING "status"::"traffic_route_status";
