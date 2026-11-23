import { GET } from "@/app/api/forecast/route";
import { getSession } from "@/lib/auth/session";
import { getLatestForecast } from "@/lib/forecasts/data-access";
import { type SerializedForecast } from "@/lib/forecasts/serialization";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/forecasts/data-access", () => ({ getLatestForecast: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

const mockedGetSession = vi.mocked(getSession);
const mockedGetLatestForecast = vi.mocked(getLatestForecast);

const NOW = new Date("2026-11-23T10:00:00.000Z");
const SESSION = {
  session: {
    id: "session-1",
    createdAt: NOW,
    updatedAt: NOW,
    userId: "user-1",
    expiresAt: new Date("2026-12-23T10:00:00.000Z"),
    token: "token-1",
  },
  user: {
    id: "user-1",
    createdAt: NOW,
    updatedAt: NOW,
    email: "demo@greenwave.local",
    emailVerified: true,
    name: "Demo",
  },
};

const forecast: SerializedForecast = {
  generatedAt: NOW.toISOString(),
  slotStarts: ["2026-11-23T10:15:00.000Z"],
  tauMinutes: 60,
  segments: [
    {
      routeId: "1",
      segmentId: "a",
      relativeSpeedPcts: [80],
      speedsKmh: [40],
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mockedGetSession.mockResolvedValue(SESSION);
});

describe("GET /api/forecast", () => {
  it("answers 401 without reading the forecast when signed out", async () => {
    mockedGetSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockedGetLatestForecast).not.toHaveBeenCalled();
  });

  it("returns the newest forecast", async () => {
    mockedGetLatestForecast.mockResolvedValue(forecast);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(forecast);
  });

  it("returns null when there is no forecast yet", async () => {
    mockedGetLatestForecast.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
  });
});
