-- Replaces the proof of concept's snapshot tables with the pipeline's. The old
-- traffic_route and traffic_segment rows are only snapshot leftovers (geometry
-- returns with the first observation), so they are dropped and recreated rather
-- than altered: adding required columns fails on a table that has rows.
-- traffic_history and traffic_route_history are untouched.

-- DropTable
DROP TABLE "traffic_snapshot";
DROP TABLE "traffic_segment";
DROP TABLE "traffic_route";

-- DropEnum
DROP TYPE "traffic_route_status";

-- CreateEnum
CREATE TYPE "traffic_congestion" AS ENUM ('free', 'light', 'moderate', 'heavy', 'closed');

-- CreateTable
CREATE TABLE "traffic_route" (
    "cityId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lengthM" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "traffic_route_pkey" PRIMARY KEY ("cityId","id")
);

-- CreateTable
CREATE TABLE "traffic_segment" (
    "cityId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "lengthM" INTEGER NOT NULL,
    "coordinates" JSONB NOT NULL,

    CONSTRAINT "traffic_segment_pkey" PRIMARY KEY ("cityId","routeId","id")
);

-- CreateTable
CREATE TABLE "traffic_route_state" (
    "cityId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "travelTimeSec" INTEGER NOT NULL,
    "typicalTravelTimeSec" INTEGER NOT NULL,
    "delaySec" INTEGER NOT NULL,
    "passable" BOOLEAN NOT NULL,
    "congestedSince" TIMESTAMPTZ(3),
    "congestedPendingSince" TIMESTAMPTZ(3),
    "congestedStreak" INTEGER NOT NULL DEFAULT 0,
    "slowerThanUsualSince" TIMESTAMPTZ(3),
    "slowerThanUsualPendingSince" TIMESTAMPTZ(3),
    "slowerThanUsualStreak" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "traffic_route_state_pkey" PRIMARY KEY ("cityId","routeId")
);

-- CreateTable
CREATE TABLE "traffic_segment_state" (
    "cityId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "currentSpeedKmh" INTEGER NOT NULL,
    "averageSpeedKmh" INTEGER NOT NULL,
    "typicalSpeedKmh" INTEGER NOT NULL,
    "relativeSpeedPct" INTEGER NOT NULL,
    "confidencePct" INTEGER NOT NULL,
    "congestion" "traffic_congestion" NOT NULL,

    CONSTRAINT "traffic_segment_state_pkey" PRIMARY KEY ("cityId","routeId","segmentId")
);

-- CreateTable
CREATE TABLE "traffic_segment_history" (
    "bucketStart" TIMESTAMPTZ(3) NOT NULL,
    "cityId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "currentSpeedSum" INTEGER NOT NULL,
    "averageSpeedSum" INTEGER NOT NULL,
    "typicalSpeedSum" INTEGER NOT NULL,
    "relativeSpeedSum" INTEGER NOT NULL,

    CONSTRAINT "traffic_segment_history_pkey" PRIMARY KEY ("bucketStart","cityId","routeId","segmentId")
);

-- CreateTable
CREATE TABLE "traffic_observation_receipt" (
    "eventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_observation_receipt_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE INDEX "traffic_observation_receipt_receivedAt_idx" ON "traffic_observation_receipt"("receivedAt");

-- CreateIndex
CREATE INDEX "traffic_segment_cityId_routeId_ordinal_idx" ON "traffic_segment"("cityId", "routeId", "ordinal");

-- AddForeignKey
ALTER TABLE "traffic_segment" ADD CONSTRAINT "traffic_segment_cityId_routeId_fkey" FOREIGN KEY ("cityId", "routeId") REFERENCES "traffic_route"("cityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_route_state" ADD CONSTRAINT "traffic_route_state_cityId_routeId_fkey" FOREIGN KEY ("cityId", "routeId") REFERENCES "traffic_route"("cityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_segment_state" ADD CONSTRAINT "traffic_segment_state_cityId_routeId_segmentId_fkey" FOREIGN KEY ("cityId", "routeId", "segmentId") REFERENCES "traffic_segment"("cityId", "routeId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
