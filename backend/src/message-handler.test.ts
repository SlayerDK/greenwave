import { observationSchema, type RouteState } from "@greenwave/shared";
import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";
import fixture from "../../shared/src/fixtures/observation-56634.json";
import { createMessageHandler } from "./message-handler";
import { Metrics } from "./metrics";
import type { ProcessResult } from "./process-observation";
import { classifySegments } from "./rules";
import { toRouteState } from "./state-message";

const observation = observationSchema.parse(fixture);
const off = { since: null, pendingSince: null, streak: 0 };
const state = toRouteState(
  observation,
  classifySegments(observation.segments),
  off,
  off,
);
const TOPIC = "greenwave/v1/aarhus/routes/56634/observations";

type LogLine = { level: number; msg: string; topic?: string };
const WARN = 40;

/** Resolves only when `release` is called; stands in for a slow commit or PUBACK. */
const deferred = <T>(value: T) => {
  let release: (() => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    release = () => resolve(value);
  });

  return { promise, release: () => release?.() };
};

/** A real pino logger writing its JSON lines into an array. */
const setup = ({
  transaction = async (): Promise<ProcessResult> => ({
    status: "current",
    state,
  }),
  publish = async () => undefined,
}: {
  transaction?: () => Promise<ProcessResult>;
  publish?: (state: RouteState) => Promise<void>;
} = {}) => {
  const lines: LogLine[] = [];
  const logger = pino(
    { level: "debug" },
    { write: (line: string) => lines.push(JSON.parse(line) as LogLine) },
  );
  const metrics = new Metrics(logger);
  const counted = {
    processed: vi.spyOn(metrics, "processedMessage"),
    duplicate: vi.spyOn(metrics, "duplicateMessage"),
    invalid: vi.spyOn(metrics, "invalidMessage"),
    published: vi.spyOn(metrics, "publishedMessage"),
  };
  const processObservation = vi.fn(transaction);
  const publishState = vi.fn(publish);
  const onFatal = vi.fn();
  const handler = createMessageHandler({
    processObservation,
    publishState,
    metrics,
    logger,
    onFatal,
  });

  const deliver = (payload: string = JSON.stringify(observation)) => {
    const done = vi.fn();
    handler.handleMessage(
      { topic: TOPIC, payload: Buffer.from(payload) },
      done,
    );

    return done;
  };

  return {
    handler,
    deliver,
    processObservation,
    publishState,
    counted,
    onFatal,
    lines,
  };
};

describe("createMessageHandler", () => {
  it("acknowledges a reading without waiting for its state's PUBACK", async () => {
    // The PUBACK would queue behind this message: awaiting it never ends.
    const { deliver, publishState, counted } = setup({
      publish: () => new Promise(() => undefined),
    });

    const done = deliver();

    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(publishState).toHaveBeenCalledWith(state);
    expect(counted.processed).toHaveBeenCalledOnce();
    expect(counted.published).not.toHaveBeenCalled();
  });

  it("counts a state as published once the broker acknowledges it", async () => {
    const puback = deferred(undefined);
    const { deliver, counted } = setup({ publish: () => puback.promise });

    const done = deliver();
    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(counted.published).not.toHaveBeenCalled();

    puback.release();
    await vi.waitFor(() => expect(counted.published).toHaveBeenCalledOnce());
  });

  it("counts a late reading as processed but publishes nothing", async () => {
    const { deliver, publishState, counted } = setup({
      transaction: async () => ({ status: "stale" }),
    });

    const done = deliver();

    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(counted.processed).toHaveBeenCalledOnce();
    expect(counted.duplicate).not.toHaveBeenCalled();
    expect(publishState).not.toHaveBeenCalled();
  });

  it("counts a redelivery as a duplicate and publishes nothing", async () => {
    const { deliver, publishState, counted } = setup({
      transaction: async () => ({ status: "duplicate" }),
    });

    const done = deliver();

    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(counted.duplicate).toHaveBeenCalledOnce();
    expect(counted.processed).not.toHaveBeenCalled();
    expect(publishState).not.toHaveBeenCalled();
  });

  it.each([
    ["is not JSON", "{", "invalid JSON observation"],
    [
      "fails the schema",
      JSON.stringify({ ...observation, routeId: 56634 }),
      "invalid observation",
    ],
  ])(
    "acknowledges and counts a payload that %s, logging its topic",
    async (_, payload, msg) => {
      const { deliver, processObservation, counted, lines } = setup();

      const done = deliver(payload);

      await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
      expect(counted.invalid).toHaveBeenCalledOnce();
      expect(processObservation).not.toHaveBeenCalled();
      expect(lines).toContainEqual(
        expect.objectContaining({ level: WARN, msg, topic: TOPIC }),
      );
    },
  );

  it("leaves a reading unacknowledged when the database fails", async () => {
    const failure = new Error("connection refused");
    const { deliver, onFatal } = setup({
      transaction: () => Promise.reject(failure),
    });

    const done = deliver();

    await vi.waitFor(() => expect(onFatal).toHaveBeenCalledWith(failure));
    expect(done).not.toHaveBeenCalled();
  });

  it("treats a refused state publish as fatal", async () => {
    const failure = new Error("not authorized");
    const { deliver, onFatal } = setup({
      publish: () => Promise.reject(failure),
    });

    deliver();

    await vi.waitFor(() => expect(onFatal).toHaveBeenCalledWith(failure));
  });

  it("stops after the reading in flight, releasing later ones without a PUBACK", async () => {
    const commit = deferred<ProcessResult>({ status: "current", state });
    const { handler, deliver, processObservation } = setup({
      transaction: () => commit.promise,
    });

    const first = deliver();
    let stopped = false;
    const stopping = handler.stop().then(() => {
      stopped = true;
    });
    const second = deliver();

    await vi.waitFor(() => expect(processObservation).toHaveBeenCalledOnce());
    expect(stopped).toBe(false);

    commit.release();
    await stopping;

    // The first gets its PUBACK; an error skips the second's, so the broker
    // redelivers it, while MQTT.js moves on to the packets behind it.
    expect(first).toHaveBeenCalledExactlyOnceWith();
    expect(second).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
    expect(processObservation).toHaveBeenCalledOnce();
  });
});
