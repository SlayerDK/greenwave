import { classifyCongestion } from "@greenwave/shared";
import { forecastValue } from "./forecast";
import {
  resolveProfile,
  type RouteShape,
  type SegmentProfile,
} from "./profile";
import { dayTypeOf, localSlotOf } from "./slots";

export const BACKTEST_TAUS = [15, 30, 60, 120] as const;
const FIRST_ORIGIN_SLOT = 6 * 4;
const LAST_ORIGIN_SLOT = 22 * 4;
const LONGEST_FIXED_HORIZON = 240;
const FIXED_HORIZONS = new Set([15, 30, 60, 120, LONGEST_FIXED_HORIZON]);

export type Bucket = { kmh: number; rel: number; typicalKmh: number };

export type BacktestSegment = {
  key: string;
  lengthM: number;
  profile: SegmentProfile;
  shape: RouteShape | undefined;
  /** By the bucket's UTC start in milliseconds. */
  buckets: Map<number, Bucket>;
};

type Score = {
  method: string;
  tau: number | "";
  horizon: string;
  absoluteError: number;
  correctLength: number;
  length: number;
  segments: Set<string>;
  samples: number;
};

export type Scoreboard = Map<string, Score>;
type Prediction = { kmh: number; rel: number };

/** Fixed horizons, plus everything further ahead as "rest-of-day". */
const horizonLabel = (minutes: number) => {
  if (FIXED_HORIZONS.has(minutes)) return `${minutes}m`;
  return minutes > LONGEST_FIXED_HORIZON ? "rest-of-day" : null;
};

const levelOf = ({ kmh, rel }: Prediction) =>
  classifyCongestion({
    currentSpeed: Math.round(kmh),
    relativeSpeed: Math.round(rel),
  });

/** Weighted by length: neighbouring segments repeat their section's speed. */
export const recordSample = (
  board: Scoreboard,
  sample: {
    method: string;
    tau: number | "";
    horizon: string;
    predicted: Prediction;
    actual: Prediction;
    segmentKey: string;
    lengthM: number;
  },
) => {
  const id = `${sample.method}|${sample.tau}|${sample.horizon}`;
  let score = board.get(id);
  if (!score) {
    score = {
      method: sample.method,
      tau: sample.tau,
      horizon: sample.horizon,
      absoluteError: 0,
      correctLength: 0,
      length: 0,
      segments: new Set(),
      samples: 0,
    };
    board.set(id, score);
  }

  // Whole km/h for every method, as the forecast stores: actual speeds are
  // mostly whole numbers, so scoring one method unrounded would skew the MAE.
  score.absoluteError +=
    Math.abs(Math.round(sample.predicted.kmh) - sample.actual.kmh) *
    sample.lengthM;
  if (levelOf(sample.predicted) === levelOf(sample.actual)) {
    score.correctLength += sample.lengthM;
  }
  score.length += sample.lengthM;
  score.segments.add(sample.segmentKey);
  score.samples += 1;
};

/**
 * TomTom's typical speed has no relative value of its own, so it is expressed
 * against the free-flow speed implied by the actual reading.
 */
const typicalPrediction = (actual: Bucket): Prediction => {
  const freeFlow = actual.rel > 0 ? (actual.kmh * 100) / actual.rel : 0;
  return {
    kmh: actual.typicalKmh,
    rel: freeFlow > 0 ? (actual.typicalKmh / freeFlow) * 100 : 100,
  };
};

const scoreTarget = (
  board: Scoreboard,
  segment: BacktestSegment,
  origin: { bucket: Bucket; profile: Prediction },
  target: Date,
  actual: Bucket,
  horizonMinutes: number,
  horizon: string,
) => {
  const { key: segmentKey, lengthM, profile, shape } = segment;
  const targetProfile = resolveProfile(
    profile,
    dayTypeOf(target),
    localSlotOf(target),
    shape,
  );
  const record = (method: string, tau: number | "", predicted: Prediction) =>
    recordSample(board, {
      method,
      tau,
      horizon,
      predicted,
      actual,
      segmentKey,
      lengthM,
    });

  // With no current reading the formula is the profile alone, clamped and
  // rounded exactly as our method is, so the two differ only by the deviation.
  const predictFrom = (
    current: Prediction | null,
    tauMinutes: number,
  ): Prediction => ({
    kmh: forecastValue({
      horizonMinutes,
      tauMinutes,
      profileAtTarget: targetProfile.kmh,
      profileNow: origin.profile.kmh,
      current: current?.kmh ?? null,
      maximum: profile.maxKmh,
    }),
    rel: forecastValue({
      horizonMinutes,
      tauMinutes,
      profileAtTarget: targetProfile.rel,
      profileNow: origin.profile.rel,
      current: current?.rel ?? null,
      maximum: profile.maxRel,
    }),
  });

  record("persistence", "", origin.bucket);
  record("profile", "", predictFrom(null, 1));
  record("tomtom-typical", "", typicalPrediction(actual));

  for (const tauMinutes of BACKTEST_TAUS) {
    record("ours", tauMinutes, predictFrom(origin.bucket, tauMinutes));
  }
};

/**
 * Every quarter hour from 06:00 to 22:00 acts as "now", using that bucket's
 * mean as the current reading, and forecasts forward within the same day.
 */
export const evaluateDay = (
  board: Scoreboard,
  quarterHours: readonly Date[],
  segments: readonly BacktestSegment[],
) => {
  quarterHours.forEach((originTime, originIndex) => {
    const originSlot = localSlotOf(originTime);
    if (originSlot < FIRST_ORIGIN_SLOT || originSlot > LAST_ORIGIN_SLOT) return;

    for (const segment of segments) {
      const bucket = segment.buckets.get(originTime.getTime());
      if (!bucket) continue;

      const origin = {
        bucket,
        profile: resolveProfile(
          segment.profile,
          dayTypeOf(originTime),
          originSlot,
          segment.shape,
        ),
      };

      for (const target of quarterHours.slice(originIndex + 1)) {
        const horizonMinutes =
          (target.getTime() - originTime.getTime()) / 60_000;
        const horizon = horizonLabel(horizonMinutes);
        const actual = segment.buckets.get(target.getTime());
        if (!horizon || !actual) continue;

        scoreTarget(
          board,
          segment,
          origin,
          target,
          actual,
          horizonMinutes,
          horizon,
        );
      }
    }
  });
};

export const toCsv = (board: Scoreboard) => {
  const lines = [...board.values()].map((score) =>
    [
      score.method,
      score.tau,
      score.horizon,
      (score.absoluteError / score.length).toFixed(3),
      (score.correctLength / score.length).toFixed(4),
      score.segments.size,
      score.samples,
    ].join(","),
  );

  return [
    "method,tau,horizon,maeKmh,levelAccuracy,segments,samples",
    ...lines,
    "",
  ].join("\n");
};
