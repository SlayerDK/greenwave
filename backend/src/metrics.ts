import type pino from "pino";

export class Metrics {
  private processed = 0;
  private duplicates = 0;
  private invalid = 0;
  private published = 0;
  private lags: number[] = [];

  constructor(private readonly logger: pino.Logger) {}

  processedMessage(lagMs: number) {
    this.processed += 1;
    this.lags.push(lagMs);
  }
  duplicateMessage() {
    this.duplicates += 1;
  }
  invalidMessage() {
    this.invalid += 1;
  }
  publishedMessage() {
    this.published += 1;
  }

  start() {
    return setInterval(() => {
      const sorted = [...this.lags].sort((a, b) => a - b);
      const percentile = (fraction: number) =>
        sorted.length === 0
          ? 0
          : sorted[
              Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
            ];
      this.logger.info({
        msg: "metrics",
        windowS: 10,
        processed: this.processed,
        duplicates: this.duplicates,
        invalid: this.invalid,
        published: this.published,
        lagP50Ms: percentile(0.5),
        lagP95Ms: percentile(0.95),
      });
      this.processed = 0;
      this.duplicates = 0;
      this.invalid = 0;
      this.published = 0;
      this.lags = [];
    }, 10_000);
  }
}
