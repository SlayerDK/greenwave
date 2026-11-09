-- AlterTable
ALTER TABLE "traffic_history" ADD COLUMN     "confidence" INTEGER;

-- CreateTable
CREATE TABLE "traffic_route_history" (
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "routeId" INTEGER NOT NULL,
    "travelTime" INTEGER NOT NULL,
    "typicalTravelTime" INTEGER NOT NULL,
    "delayTime" INTEGER NOT NULL,
    "completeness" INTEGER NOT NULL,
    "routeConfidence" INTEGER NOT NULL,
    "passable" BOOLEAN NOT NULL,

    CONSTRAINT "traffic_route_history_pkey" PRIMARY KEY ("recordedAt","routeId")
);
