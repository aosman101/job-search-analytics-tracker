import { describe, expect, it } from "vitest";
import { buildEmploymentMetrics, employmentState, formatTenure, tenureDays, validateEmploymentDates } from "./employment";
import { applyStatusTransition, normalizeApplication } from "./applicationLifecycle";
import { buildTrackerMetrics } from "./applicationMetrics";

const TODAY = "2026-10-23";

describe("employment state and tenure", () => {
  it("counts a current job up to today", () => {
    const app = { status: "Job Secured", startDate: "2026-10-01" };
    expect(employmentState(app, TODAY)).toBe("current");
    expect(tenureDays(app, TODAY)).toBe(22);
  });

  it("uses the finish date for a finished job", () => {
    const app = { status: "Job Secured", startDate: "2025-01-01", endDate: "2025-07-01" };
    expect(employmentState(app, TODAY)).toBe("finished");
    expect(tenureDays(app, TODAY)).toBe(181);
  });

  it("has no tenure before the start date or without one", () => {
    expect(employmentState({ startDate: "2026-11-01" }, TODAY)).toBe("upcoming");
    expect(tenureDays({ startDate: "2026-11-01" }, TODAY)).toBeNull();
    expect(tenureDays({}, TODAY)).toBeNull();
  });

  it("formats durations readably", () => {
    expect(formatTenure(1)).toBe("1 day");
    expect(formatTenure(20)).toBe("20 days");
    expect(formatTenure(95)).toBe("3 months");
    expect(formatTenure(365)).toBe("1 yr");
    expect(formatTenure(500)).toBe("1 yr 4 mo");
    expect(formatTenure(null)).toBe("—");
  });

  it("validates the start/finish pair", () => {
    expect(validateEmploymentDates({ startDate: "" })).not.toBe("");
    expect(validateEmploymentDates({ startDate: "2026-02-01", endDate: "2026-01-01" })).not.toBe("");
    expect(validateEmploymentDates({ startDate: "2026-01-01", endDate: "" })).toBe("");
  });
});

describe("employment metrics", () => {
  it("averages only finished jobs and totals all time worked", () => {
    const metrics = buildEmploymentMetrics([
      { id: 1, status: "Job Secured", dateApplied: "2024-12-01", securedAt: "2024-12-21", startDate: "2025-01-01", endDate: "2025-03-02" },
      { id: 2, status: "Job Secured", dateApplied: "2025-04-01", securedAt: "2025-04-11", startDate: "2025-05-01", endDate: "2025-06-30" },
      { id: 3, status: "Job Secured", dateApplied: "2026-08-01", securedAt: "2026-09-01", startDate: "2026-10-01" },
      { id: 4, status: "Offer", dateApplied: "2026-08-01" },
    ], TODAY);

    expect(metrics.secured.map((app) => app.id)).toEqual([3, 2, 1]);
    expect(metrics.current.map((app) => app.id)).toEqual([3]);
    expect(metrics.avgTenureDays).toBe(60);
    expect(metrics.totalTenureDays).toBe(60 + 60 + 22);
    expect(metrics.avgDaysToSecure).toBe(20);
  });
});

describe("Job Secured lifecycle", () => {
  it("stamps securedAt and backfills the offer", () => {
    const app = applyStatusTransition({ id: 1, status: "Interview", dateApplied: "2026-09-01" }, "Job Secured", TODAY);
    expect(app.securedAt).toBe(TODAY);
    expect(app.offerAt).toBe(TODAY);
  });

  it("normalizes older secured records", () => {
    const app = normalizeApplication({ id: 1, status: "Job Secured", dateApplied: "2026-09-01", startDate: "2026-10-01" }, TODAY);
    expect(app.securedAt).toBe("2026-10-01");
    expect(app.offerAt).toBe("2026-10-01");
  });

  it("counts secured jobs as offers and keeps them out of the active pipeline", () => {
    const metrics = buildTrackerMetrics([
      { id: 1, status: "Job Secured", role: "Data Engineer", dateApplied: "2026-09-01", startDate: "2026-10-01", updatedAt: "2026-09-01" },
      { id: 2, status: "Offer", role: "Data Engineer", dateApplied: "2026-09-01", updatedAt: "2026-09-01" },
      { id: 3, status: "Applied", role: "Data Engineer", dateApplied: "2026-10-20", followUpDate: "2026-10-21" },
    ], { now: new Date(2026, 9, 23), today: TODAY });

    expect(metrics.offerRate).toBe(67);
    expect(metrics.securedRate).toBe(33);
    expect(metrics.activeApplications).toBe(2);
    expect(metrics.interviewQueue.map((app) => app.id)).toEqual([2]);
    expect(metrics.roleOutcomes[0]).toMatchObject({ offers: 2, active: 1 });
    expect(metrics.nextActions.map((action) => action.id)).toContain("close-offers");
  });
});
