export const localSlotOf = (instant: Date): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 4 + Math.floor(minute / 15);
};

export const slotsUntilMidnight = (now: Date): Date[] => {
  const slots: Date[] = [];
  const start = new Date(now);
  start.setUTCSeconds(0, 0);
  start.setUTCMinutes(Math.floor(start.getUTCMinutes() / 15) * 15);

  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDate = dateFormatter.format(now);
  let cursor = new Date(start);
  cursor.setTime(cursor.getTime() + 15 * 60 * 1000);

  while (true) {
    if (dateFormatter.format(cursor) !== localDate) break;
    slots.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + 15 * 60 * 1000);
  }

  return slots;
};
