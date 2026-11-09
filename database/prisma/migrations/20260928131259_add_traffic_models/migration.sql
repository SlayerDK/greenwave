-- CreateTable
CREATE TABLE "traffic_route" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lengthMeters" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traffic_route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_segment" (
    "id" TEXT NOT NULL,
    "segmentIdStr" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "lengthMeters" INTEGER NOT NULL,
    "shape" JSONB NOT NULL,
    "routeId" INTEGER NOT NULL,

    CONSTRAINT "traffic_segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_snapshot" (
    "id" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "travelTime" INTEGER NOT NULL,
    "typicalTravelTime" INTEGER NOT NULL,
    "delayTime" INTEGER NOT NULL,
    "completeness" INTEGER NOT NULL,
    "routeConfidence" INTEGER NOT NULL,
    "passable" BOOLEAN NOT NULL,
    "segmentSpeeds" JSONB NOT NULL,
    "routeId" INTEGER NOT NULL,

    CONSTRAINT "traffic_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "traffic_segment_routeId_ordinal_idx" ON "traffic_segment"("routeId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "traffic_segment_routeId_segmentIdStr_key" ON "traffic_segment"("routeId", "segmentIdStr");

-- CreateIndex
CREATE INDEX "traffic_snapshot_routeId_recordedAt_idx" ON "traffic_snapshot"("routeId", "recordedAt");

-- AddForeignKey
ALTER TABLE "traffic_segment" ADD CONSTRAINT "traffic_segment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "traffic_route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_snapshot" ADD CONSTRAINT "traffic_snapshot_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "traffic_route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
