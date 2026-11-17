import { describe, expect, it } from "vitest";
import { AARHUS_ROUTE_IDS, adapterEnvSchema } from "./env";

const required = {
  MQTT_URL: "mqtt://localhost:1883",
  MQTT_ADAPTER_PASSWORD: "secret",
};

describe("adapterEnvSchema", () => {
  it("requires a TomTom key in live mode", () => {
    expect(
      adapterEnvSchema.safeParse({ ...required, ADAPTER_SOURCE: "tomtom" })
        .success,
    ).toBe(false);
  });

  it("needs no key in fixture mode", () => {
    expect(
      adapterEnvSchema.safeParse({ ...required, ADAPTER_SOURCE: "fixture" })
        .success,
    ).toBe(true);
  });

  it("defaults to Aarhus, its 13 routes and info logging", () => {
    const env = adapterEnvSchema.parse({
      ...required,
      ADAPTER_SOURCE: "fixture",
    });

    expect(env.CITY_ID).toBe("aarhus");
    expect(env.ROUTE_IDS).toEqual(AARHUS_ROUTE_IDS);
    expect(env.ROUTE_IDS).toHaveLength(13);
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("splits and trims a route override", () => {
    const env = adapterEnvSchema.parse({
      ...required,
      ADAPTER_SOURCE: "fixture",
      ROUTE_IDS: " 1, 2 ,3",
    });

    expect(env.ROUTE_IDS).toEqual(["1", "2", "3"]);
  });

  it.each(["", "1,,2", "56634,abc", "56/634"])(
    "rejects ROUTE_IDS %j",
    (ROUTE_IDS) => {
      expect(
        adapterEnvSchema.safeParse({
          ...required,
          ADAPTER_SOURCE: "fixture",
          ROUTE_IDS,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects a CITY_ID that is not lower case", () => {
    expect(
      adapterEnvSchema.safeParse({
        ...required,
        ADAPTER_SOURCE: "fixture",
        CITY_ID: "Aarhus",
      }).success,
    ).toBe(false);
  });
});
