import { describe, expect, it } from "vitest";
import { buildAnalytics, firstResponseDate, outcomeOf, percentile, splitByRange } from "./analytics";
import { buildTrackerMetrics, heardBack } from "./applicationMetrics";

const TODAY = "2026-06-30";

describe("reply definition", () => {
  it("counts only employer answers, not the applicant's own moves", () => {
    expect(heardBack({ status: "Follow-Up" })).toBe(false);
    expect(heardBack({ status: "Withdrawn" })).toBe(false);
    expect(heardBack({ status: "Rejected" })).toBe(true);
    expect(heardBack({ status: "Ghosted", interviewStage: "1st Interview" })).toBe(true);
    const metrics = buildTrackerMetrics([
      { id: 1, status: "Follow-Up", dateApplied: "2026-06-01" },
      { id: 2, status: "Rejected", dateApplied: "2026-06-01" },
    ]);
    expect(metrics.responseRate).toBe(50);
  });

  it("takes the earliest answer and ignores dates before applying", () => {
    expect(firstResponseDate({ dateApplied: "2026-06-01", interviewStartedAt: "2026-06-09", rejectedAt: "2026-06-20" })).toBe("2026-06-09");
    expect(firstResponseDate({ dateApplied: "2026-06-01", rejectedAt: "2026-05-20" })).toBe("");
  });

  it("files an interview-then-rejection under progressed", () => {
    expect(outcomeOf({ status: "Rejected", interviewStage: "2nd Interview" })).toBe("progressed");
    expect(outcomeOf({ status: "Rejected" })).toBe("rejected");
    expect(outcomeOf({ status: "Ghosted" })).toBe("silent");
    expect(outcomeOf({ status: "Follow-Up" })).toBe("open");
  });
});

describe("ranges", () => {
  const apps = [
    { id: 1, dateApplied: "2026-06-30" },
    { id: 2, dateApplied: "2026-06-01" },
    { id: 3, dateApplied: "2026-05-31" },
    { id: 4, dateApplied: "2026-04-01" },
  ];

  it("splits the current window from the equal window before it", () => {
    const { current, previous } = splitByRange(apps, 30, TODAY);
    expect(current.map((app) => app.id)).toEqual([1, 2]);
    expect(previous.map((app) => app.id)).toEqual([3]);
    expect(splitByRange(apps, null, TODAY)).toEqual({ current: apps, previous: null });
  });

  it("buckets weekly for short spans and monthly for long ones", () => {
    const short = buildAnalytics(apps, { today: TODAY, days: 30 });
    expect(short.cohorts.unit).toBe("week");
    expect(short.cohorts.buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(2);
    const long = buildAnalytics([...apps, { id: 5, dateApplied: "2025-09-10" }], { today: TODAY });
    expect(long.cohorts.unit).toBe("month");
    expect(long.cohorts.buckets[0].key).toBe("2025-09");
    expect(long.cohorts.buckets).toHaveLength(10);
  });
});

describe("analytics", () => {
  it("uses nearest-rank percentiles", () => {
    expect(percentile([1, 2, 3, 4, 10], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 10], 80)).toBe(4);
    expect(percentile([], 50)).toBeNull();
  });

  it("reports rates with their counts and reply timing", () => {
    const data = buildAnalytics([
      { id: 1, status: "Interview", source: "Referral", dateApplied: "2026-06-01", interviewStartedAt: "2026-06-05" },
      { id: 2, status: "Rejected", source: "LinkedIn", dateApplied: "2026-06-01", rejectedAt: "2026-06-11" },
      { id: 3, status: "Ghosted", source: "LinkedIn", dateApplied: "2026-06-01" },
      { id: 4, status: "Applied", source: "LinkedIn", dateApplied: "2026-06-28" },
    ], { today: TODAY });
    expect(data.kpis).toMatchObject({ total: 4, replied: 2, replyRate: 50, interviews: 1, interviewRate: 25, ghostRate: 25, medianReplyDays: 4 });
    expect(data.timing.buckets.map((bucket) => bucket.count)).toEqual([0, 1, 1, 0, 0]);
    expect(data.funnel.map((stage) => stage.count)).toEqual([4, 1, 0, 0, 0, 0]);
    expect(data.rejections).toMatchObject({ total: 1, beforeInterview: 1 });
    // LinkedIn has enough applications to rank; Referral's single one trails as a thin sample.
    expect(data.segments.source.map((row) => [row.label, row.lowSample])).toEqual([["LinkedIn", false], ["Referral", true]]);
  });

  it("compares follow-ups only among applications silent for a week", () => {
    const sent = (date) => [{ date, method: "LinkedIn message" }];
    const { followUps } = buildAnalytics([
      // Replied within a week: excluded, it never needed chasing.
      { id: 1, status: "Rejected", dateApplied: "2026-06-01", rejectedAt: "2026-06-03" },
      // Chased, then replied.
      { id: 2, status: "Interview", dateApplied: "2026-06-01", interviewStartedAt: "2026-06-15", followUpHistory: sent("2026-06-09") },
      // Chased, still silent.
      { id: 3, status: "Applied", dateApplied: "2026-06-01", followUpHistory: sent("2026-06-09") },
      // Never chased, replied late.
      { id: 4, status: "Rejected", dateApplied: "2026-06-01", rejectedAt: "2026-06-20" },
      // A follow-up that never reached anyone doesn't count as chasing.
      { id: 5, status: "Ghosted", dateApplied: "2026-06-01", followUpHistory: [{ date: "2026-06-09", method: "No LinkedIn available" }] },
      // Too recent to judge.
      { id: 6, status: "Applied", dateApplied: "2026-06-27" },
    ], { today: TODAY });
    expect(followUps.chased).toEqual({ total: 2, replied: 1, rate: 50 });
    expect(followUps.left).toEqual({ total: 2, replied: 1, rate: 50 });
    expect(followUps.sentCount).toBe(2);
  });

  it("holds insights back until there is enough data", () => {
    expect(buildAnalytics([{ id: 1, status: "Applied", dateApplied: "2026-06-01" }], { today: TODAY }).insights).toEqual([]);
    const rejected = Array.from({ length: 6 }, (_, id) => ({ id, status: "Rejected", dateApplied: "2026-06-01", rejectedAt: "2026-06-08" }));
    const titles = buildAnalytics(rejected, { today: TODAY, days: 30 }).insights.map((insight) => insight.title);
    expect(titles).toContain("Rejections come before the interview");
    expect(titles).toContain("Most replies land within 7 days");
    expect(titles).toContain("Pace is up");
  });
});
