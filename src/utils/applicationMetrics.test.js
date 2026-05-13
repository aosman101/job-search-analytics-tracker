import { describe, expect, it } from "vitest";
import { buildTrackerMetrics } from "./applicationMetrics";

describe("application metrics", () => {
  it("uses rejectedAt for average rejection time instead of today's date", () => {
    const metrics = buildTrackerMetrics([
      { id: 1, status: "Rejected", dateApplied: "2026-05-01", rejectedAt: "2026-05-06" },
      { id: 2, status: "Rejected", dateApplied: "2026-05-01", rejectedAt: "2026-05-11" },
    ], { now: new Date(2026, 4, 13) });

    expect(metrics.avgDaysToRejection).toBe(8);
  });

  it("finds due follow-ups that have not been completed", () => {
    const metrics = buildTrackerMetrics([
      { id: 1, status: "Applied", dateApplied: "2026-05-01", followUpDate: "2026-05-10" },
      { id: 2, status: "Applied", dateApplied: "2026-05-01", followUpDate: "2026-05-10", followUpStatus: "messaged" },
      { id: 3, status: "Rejected", dateApplied: "2026-05-01", followUpDate: "2026-05-10" },
    ], { today: "2026-05-13" });

    expect(metrics.dueFollowUps.map((app) => app.id)).toEqual([1]);
  });
});
