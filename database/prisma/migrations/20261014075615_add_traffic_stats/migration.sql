-- CreateTable
CREATE TABLE "traffic_stats_dataset" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "dayCount" INTEGER NOT NULL,
    "slotStartMinutes" INTEGER[],
    "slotEndMinutes" INTEGER[],
    "exportedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_stats_dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_stats_route" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "lengthMeters" INTEGER NOT NULL,
    "medianTravelTimes" DOUBLE PRECISION[],
    "p10TravelTimes" DOUBLE PRECISION[],
    "p90TravelTimes" DOUBLE PRECISION[],
    "datasetId" TEXT NOT NULL,

    CONSTRAINT "traffic_stats_route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_stats_segment" (
    "id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "streetName" TEXT NOT NULL,
    "speedLimit" INTEGER NOT NULL,
    "lengthMeters" DOUBLE PRECISION NOT NULL,
    "shape" JSONB NOT NULL,
    "harmonicAverageSpeeds" DOUBLE PRECISION[],
    "travelTimeRatios" DOUBLE PRECISION[],
    "sampleSizes" INTEGER[],
    "routeId" INTEGER NOT NULL,

    CONSTRAINT "traffic_stats_segment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "traffic_stats_route_datasetId_idx" ON "traffic_stats_route"("datasetId");

-- CreateIndex
CREATE INDEX "traffic_stats_segment_routeId_ordinal_idx" ON "traffic_stats_segment"("routeId", "ordinal");

-- AddForeignKey
ALTER TABLE "traffic_stats_route" ADD CONSTRAINT "traffic_stats_route_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "traffic_stats_dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "traffic_stats_segment" ADD CONSTRAINT "traffic_stats_segment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "traffic_stats_route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
