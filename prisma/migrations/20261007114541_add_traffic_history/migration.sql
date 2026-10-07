-- CreateTable
CREATE TABLE "traffic_history" (
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "routeId" INTEGER NOT NULL,
    "segmentIdStr" TEXT NOT NULL,
    "currentSpeed" INTEGER NOT NULL,
    "averageSpeed" INTEGER NOT NULL,
    "relativeSpeed" INTEGER NOT NULL,
    "typicalSpeed" INTEGER NOT NULL,

    CONSTRAINT "traffic_history_pkey" PRIMARY KEY ("recordedAt","routeId","segmentIdStr")
);
