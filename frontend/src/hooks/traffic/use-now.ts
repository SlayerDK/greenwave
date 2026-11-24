"use client";

import { useEffect, useState } from "react";

const TICK_MS = 30_000;

/**
 * Starts from the server's render time so the first client render matches the
 * HTML, then ticks, which is what turns a route grey without a new message.
 */
export const useNow = (initialNow: number) => {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return now;
};
