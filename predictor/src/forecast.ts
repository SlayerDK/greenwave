const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const forecastValue = (
  profile: number,
  current: number,
  horizonMinutes: number,
  tauMinutes: number,
  maximum: number,
) => {
  const deviation = current - profile;
  const value = profile + deviation * Math.exp(-horizonMinutes / tauMinutes);
  return clamp(Math.round(value), 0, maximum);
};
