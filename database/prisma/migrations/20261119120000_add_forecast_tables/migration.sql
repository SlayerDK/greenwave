CREATE TABLE "traffic_forecast_run" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL,
    "slotStarts" TIMESTAMPTZ(3)[],
    "tauMinutes" INTEGER NOT NULL,

    CONSTRAINT "traffic_forecast_run_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "traffic_forecast_run_cityId_generatedAt_idx"
ON "traffic_forecast_run"("cityId", "generatedAt");

CREATE TABLE "traffic_segment_forecast" (
    "runId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "relativeSpeedPcts" INTEGER[] NOT NULL,
    "speedsKmh" INTEGER[] NOT NULL,

    CONSTRAINT "traffic_segment_forecast_pkey"
    PRIMARY KEY ("runId", "cityId", "routeId", "segmentId")
);

ALTER TABLE "traffic_segment_forecast"
ADD CONSTRAINT "traffic_segment_forecast_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "traffic_forecast_run"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
