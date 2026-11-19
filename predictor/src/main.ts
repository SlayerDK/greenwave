import { Cron } from "croner";
import { runForecast } from "./run-forecast";

void runForecast();

new Cron(
  "2,17,32,47 * * * *",
  { protect: true, timezone: "UTC" },
  () => void runForecast(new Date()),
);
