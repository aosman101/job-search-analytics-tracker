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

  it("builds actionable search workflow metrics", () => {
    const metrics = buildTrackerMetrics([
      { id: 1, status: "Applied", role: "Data Engineer", location: "London", dateApplied: "2026-05-01", updatedAt: "2026-05-01" },
      { id: 2, status: "Interview", role: "Data Engineer", location: "London", dateApplied: "2026-05-02", interviewStartedAt: "2026-05-08", updatedAt: "2026-05-08" },
      { id: 3, status: "Applied", role: "Data Analyst", location: "Remote", dateApplied: "2026-05-20" },
    ], { now: new Date(2026, 4, 26), today: "2026-05-26" });

    expect(metrics.avgDaysToInterview).toBe(6);
    expect(metrics.unscheduledFollowUps.map((app) => app.id)).toContain(1);
    expect(metrics.stalledInterviews.map((app) => app.id)).toContain(2);
    expect(metrics.roleOutcomes[0]).toMatchObject({
      label: "Data Engineer",
      total: 2,
      interviews: 1,
      interviewRate: 50,
    });
    expect(metrics.nextActions.map((action) => action.label)).toContain("Schedule missing follow-ups");
  });
});
