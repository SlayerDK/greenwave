import { z } from "zod";

/**
 * Every TomTom route the Aarhus adapter reads: the two Ringvejen directions
 * followed by the corridor pairs. `adapter/fixtures/` holds one recording per
 * id, so the two lists must change together.
 */
export const AARHUS_ROUTE_IDS = [
  "56634",
  "56628",
  "313719",
  "313720",
  "313721",
  "313722",
  "313723",
  "313724",
  "313725",
  "313726",
  "313727",
  "313728",
  "313729",
];

/** Digits only: an id goes into TomTom's URL and becomes a topic level. */
const routeIdsSchema = z
  .string()
  .transform((value) => value.split(",").map((id) => id.trim()))
  .pipe(z.array(z.string().regex(/^\d+$/, "route ids are digits only")).min(1))
  .default(AARHUS_ROUTE_IDS);

const base = {
  /** Becomes a topic level and part of the MQTT username. */
  CITY_ID: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default("aarhus"),
  ROUTE_IDS: routeIdsSchema,
  MQTT_URL: z.url(),
  MQTT_ADAPTER_PASSWORD: z.string().min(1),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
};

/** Fixture mode needs no key; it is chosen at start-up and never switched to. */
export const adapterEnvSchema = z.discriminatedUnion("ADAPTER_SOURCE", [
  z.object({
    ...base,
    ADAPTER_SOURCE: z.literal("tomtom"),
    TOMTOM_API_KEY: z.string().min(1),
  }),
  z.object({ ...base, ADAPTER_SOURCE: z.literal("fixture") }),
]);
