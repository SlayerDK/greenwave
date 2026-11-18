import {
  observationSchema,
  observationTopic,
  toEventId,
  type Observation,
} from "@greenwave/shared";
import { pino } from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../shared/src/fixtures/observation-56634.json";
import { AARHUS_ROUTE_IDS } from "./env";
import { createPoll, schedulePolls, type ReadObservation } from "./poll";
import { TrafficError } from "./tomtom-schema";

const CITY_ID = "aarhus";
const base = observationSchema.parse(fixture);

/** The shared fixture, moved to another route. */
const observationFor = (routeId: string): Observation => ({
  ...base,
  routeId,
  eventId: toEventId(CITY_ID, routeId, base.observedAt),
});

type LogLine = { level: number; msg: string; routeId?: string } & Record<
  string,
  unknown
>;
const WARN = 40;
const ERROR = 50;

/** A real pino logger writing its JSON lines into an array. */
const setup = ({
  readObservation = async (routeId) => observationFor(routeId),
  publish = async () => undefined,
  connected = true,
}: {
  readObservation?: ReadObservation;
  publish?: (topic: string, payload: string) => Promise<void>;
  connected?: boolean;
} = {}) => {
  const lines: LogLine[] = [];
  const logger = pino(
    { level: "debug" },
    { write: (line: string) => lines.push(JSON.parse(line) as LogLine) },
  );
  const read = vi.fn(readObservation);
  const pub = vi.fn(publish);
  const poll = createPoll({
    cityId: CITY_ID,
    routeIds: AARHUS_ROUTE_IDS,
    readObservation: read,
    publish: pub,
    isConnected: () => connected,
    logger,
  });

  return { poll, read, publish: pub, lines };
};

/** Fails only the first route, with whatever `fail` throws. */
const failingFirst =
  (fail: () => never): ReadObservation =>
  async (routeId) =>
    routeId === AARHUS_ROUTE_IDS[0] ? fail() : observationFor(routeId);

const lineFor = (lines: LogLine[], routeId: string) =>
  lines.find((line) => line.routeId === routeId && line.level >= WARN);

describe("createPoll", () => {
  it("reads nothing while the broker is disconnected", async () => {
    const { poll, read, publish } = setup({ connected: false });

    expect(await poll()).toEqual({ status: "skipped" });
    expect(read).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes every route to its own topic as a valid observation", async () => {
    const { poll, publish, lines } = setup();

    const summary = await poll();

    expect(summary).toMatchObject({
      status: "done",
      published: 13,
      failed: 0,
    });
    expect(publish).toHaveBeenCalledTimes(13);
    for (const [topic, payload] of publish.mock.calls) {
      const observation = observationSchema.parse(JSON.parse(payload));
      expect(topic).toBe(observationTopic(CITY_ID, observation.routeId));
    }
    expect(
      publish.mock.calls.map(([topic]) => topic.split("/")[4]).sort(),
    ).toEqual([...AARHUS_ROUTE_IDS].sort());
    expect(
      lines.filter((line) => line.msg === "published" && line.eventId),
    ).toHaveLength(13);
    expect(lines.at(-1)).toMatchObject({
      msg: "poll",
      published: 13,
      failed: 0,
    });
  });

  it("logs a TomTom failure at warn and publishes the other routes", async () => {
    const { poll, lines } = setup({
      readObservation: failingFirst(() => {
        throw new TrafficError("network", 504, "Could not reach TomTom");
      }),
    });

    expect(await poll()).toMatchObject({ published: 12, failed: 1 });
    expect(lineFor(lines, AARHUS_ROUTE_IDS[0])).toMatchObject({
      level: WARN,
      msg: "network: Could not reach TomTom",
    });
  });

  it("logs a refused key at error with a hint", async () => {
    const { poll, lines } = setup({
      readObservation: failingFirst(() => {
        throw new TrafficError("unauthorized", 403, "Forbidden");
      }),
    });

    expect(await poll()).toMatchObject({ published: 12, failed: 1 });
    const line = lineFor(lines, AARHUS_ROUTE_IDS[0]);
    expect(line?.level).toBe(ERROR);
    expect(line?.msg).toContain("check TOMTOM_API_KEY");
  });

  it("counts an unexpected error as one failed route, logged with its stack", async () => {
    const { poll, lines } = setup({
      readObservation: failingFirst(() => {
        throw new TypeError("undefined is not a function");
      }),
    });

    expect(await poll()).toMatchObject({ published: 12, failed: 1 });
    expect(lineFor(lines, AARHUS_ROUTE_IDS[0])).toMatchObject({
      level: ERROR,
      err: { type: "TypeError", stack: expect.any(String) as string },
    });
  });

  it("counts a refused publish as failed and publishes the rest", async () => {
    const refused = observationTopic(CITY_ID, AARHUS_ROUTE_IDS[0]);
    const { poll, lines } = setup({
      publish: async (topic) => {
        if (topic === refused) throw new Error("Publish error: Not authorized");
      },
    });

    expect(await poll()).toMatchObject({ published: 12, failed: 1 });
    expect(lineFor(lines, AARHUS_ROUTE_IDS[0])?.level).toBe(ERROR);
  });

  it("accounts for every route when all of them fail", async () => {
    const { poll } = setup({
      readObservation: async () => {
        throw new TrafficError("unauthorized", 401, "Unauthorized");
      },
    });

    expect(await poll()).toMatchObject({ published: 0, failed: 13 });
  });
});

describe("schedulePolls", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Minutes and seconds of the fake clock, e.g. "42:00". */
  const clock = () => new Date().toISOString().slice(14, 19);

  it("skips boundaries while a poll runs and never starts one off the boundary", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T15:41:58.000Z") });
    const events: string[] = [];
    let release: (() => void) | undefined;
    const polls = [
      // The first poll waits for PUBACKs from a broker that is paused.
      () => new Promise<void>((resolve) => (release = resolve)),
    ];
    const job = schedulePolls(
      async () => {
        events.push(`poll ${clock()}`);
        await polls.shift()?.();
      },
      { onSkip: () => events.push(`skip ${clock()}`), onBug: vi.fn() },
    );

    await vi.advanceTimersByTimeAsync(123_500); // to 44:01.5
    release?.();
    await vi.advanceTimersByTimeAsync(120_000);
    job.stop();

    expect(events).toEqual([
      "poll 42:00",
      "skip 43:00",
      "skip 44:00",
      "poll 45:00",
      "poll 46:00",
    ]);
  });

  it("hands an error that escapes the poll to onBug", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-17T15:41:59.000Z") });
    const bug = new Error("bug");
    const onBug = vi.fn();
    const job = schedulePolls(() => Promise.reject(bug), {
      onSkip: vi.fn(),
      onBug,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    job.stop();

    expect(onBug).toHaveBeenCalledWith(bug, job);
  });
});
