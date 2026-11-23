const TIME_ZONE = "Europe/Copenhagen";
export const QUARTER_HOUR_MS = 15 * 60 * 1000;

export type DayType = "weekday" | "weekend";

// Built once: these run for every segment and slot.
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const weekdayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
});

/** The Copenhagen wall-clock quarter hour, 0–95. */
export const localSlotOf = (instant: Date): number => {
  const parts = timeFormat.formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 4 + Math.floor(minute / 15);
};

/** By the Copenhagen date. Holidays are ignored. */
export const dayTypeOf = (instant: Date): DayType =>
  ["Sat", "Sun"].includes(weekdayFormat.format(instant))
    ? "weekend"
    : "weekday";

export const localDateOf = (instant: Date) => dateFormat.format(instant);

const floorToQuarterHour = (instant: Date) =>
  new Date(Math.floor(instant.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS);

/**
 * The UTC start of every quarter hour after `now`'s until local midnight.
 * Stepped in UTC, so a day with a clock change has 25 or 23 hours.
 */
export const slotsUntilMidnight = (now: Date): Date[] => {
  const localDate = localDateOf(now);
  const slots: Date[] = [];
  let cursor = floorToQuarterHour(now).getTime() + QUARTER_HOUR_MS;

  while (localDateOf(new Date(cursor)) === localDate) {
    slots.push(new Date(cursor));
    cursor += QUARTER_HOUR_MS;
  }

  return slots;
};

/** The instant local midnight began on `instant`'s Copenhagen date. */
export const startOfLocalDay = (instant: Date): Date => {
  const localDate = localDateOf(instant);
  let cursor = floorToQuarterHour(instant).getTime();

  while (localDateOf(new Date(cursor - QUARTER_HOUR_MS)) === localDate) {
    cursor -= QUARTER_HOUR_MS;
  }

  return new Date(cursor);
};

/** The `count` complete local days before `now`'s, oldest first. */
export const previousLocalDays = (now: Date, count: number): Date[] => {
  const days: Date[] = [];
  let dayStart = startOfLocalDay(now);

  for (let index = 0; index < count; index += 1) {
    dayStart = startOfLocalDay(new Date(dayStart.getTime() - 1));
    days.unshift(dayStart);
  }

  return days;
};
