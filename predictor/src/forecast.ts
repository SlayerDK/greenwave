import { STATE_TTL_SECONDS } from "@greenwave/shared";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/**
 * F(target) = P(target) + (current − P(now)) · e^(−h/τ)
 *
 * `current` is null when the live reading is missing or stale: there is no
 * deviation to carry forward, so the forecast is the profile alone.
 */
export const forecastValue = ({
  profileAtTarget,
  profileNow,
  current,
  horizonMinutes,
  tauMinutes,
  maximum,
}: {
  profileAtTarget: number;
  profileNow: number;
  current: number | null;
  horizonMinutes: number;
  tauMinutes: number;
  maximum: number;
}) => {
  const deviation = current === null ? 0 : current - profileNow;
  const value =
    profileAtTarget + deviation * Math.exp(-horizonMinutes / tauMinutes);
  return clamp(Math.round(value), 0, maximum);
};

export const isReadingFresh = (observedAt: Date, now: Date) =>
  now.getTime() - observedAt.getTime() <= STATE_TTL_SECONDS * 1000;
