-- Copies the proof of concept's rows into the pipeline's history table.
-- The old "recordedAt" is UTC in a column without a time zone, so one
-- AT TIME ZONE 'UTC' yields the right instant.
-- ON CONFLICT DO NOTHING makes a weekly re-run safe, and keeps a pipeline
-- bucket (about 15 samples) from being overwritten by a Vercel one (1 sample).
INSERT INTO traffic_segment_history (
  "bucketStart", "cityId", "routeId", "segmentId", "sampleCount",
  "currentSpeedSum", "averageSpeedSum", "typicalSpeedSum", "relativeSpeedSum"
)
SELECT "recordedAt" AT TIME ZONE 'UTC', 'aarhus', "routeId"::text, "segmentIdStr", 1,
       "currentSpeed", "averageSpeed", "typicalSpeed", "relativeSpeed"
FROM traffic_history
ON CONFLICT DO NOTHING;
