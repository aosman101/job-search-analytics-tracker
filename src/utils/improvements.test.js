import { describe, expect, it } from "vitest";
import { applyStatusTransition, autoGhost, lastContactDate } from "./applicationLifecycle";
import { buildTrackerMetrics, daysUntilGhost } from "./applicationMetrics";
import { findDuplicates } from "./applicationFilters";
import { formatDate, relativeDay } from "./dates";
import { toCSV } from "./exportCsv";
import { buildTimeline } from "./timeline";

const NOW = new Date(2026, 4, 13, 9);
const TODAY = "2026-05-13";

describe("ghost clock", () => {
  const chased = {
    id: 1,
    status: "Applied",
    dateApplied: "2026-04-01",
    followUpHistory: [{ date: "2026-05-05", method: "LinkedIn message" }],
  };

  it("counts from the last follow-up that was actually sent", () => {
    expect(lastContactDate(chased)).toBe("2026-05-05");
    expect(autoGhost([chased], TODAY)[0].status).toBe("Applied");
    expect(daysUntilGhost(chased, NOW)).toBe(13);
  });

  it("ignores follow-up attempts that never reached anyone", () => {
    const blocked = { ...chased, followUpHistory: [{ date: "2026-05-05", method: "No LinkedIn available" }] };
    expect(autoGhost([blocked], TODAY)[0].status).toBe("Ghosted");
  });

  it("ghosts relative to the supplied date, not the wall clock", () => {
    const app = { id: 2, status: "Applied", dateApplied: "2020-01-01" };
    expect(autoGhost([app], "2020-01-10")[0].status).toBe("Applied");
    expect(autoGhost([app], "2020-01-22")[0].status).toBe("Ghosted");
  });

  it("does not re-ghost an application that was manually reopened", () => {
    const ghosted = { id: 3, status: "Ghosted", dateApplied: "2026-03-01" };
    const reopened = applyStatusTransition(ghosted, "Applied", TODAY);
    expect(reopened.reopenedAt).toBe(TODAY);
    expect(autoGhost([reopened], "2026-05-20")[0].status).toBe("Applied");
    expect(autoGhost([reopened], "2026-06-03")[0].status).toBe("Ghosted");
  });
});

describe("upcoming interviews and follow-ups", () => {
  const apps = [
    { id: 1, company: "Later", status: "Interview", dateApplied: "2026-05-10", interviewDate: "2026-05-18" },
    { id: 2, company: "Sooner", status: "Interview", dateApplied: "2026-05-01", interviewDate: "2026-05-14" },
    { id: 3, company: "Past", status: "Interview", dateApplied: "2026-05-02", interviewDate: "2026-05-01" },
    { id: 4, company: "Gone", status: "Rejected", dateApplied: "2026-05-02", interviewDate: "2026-05-15" },
    { id: 5, company: "Chase", status: "Applied", dateApplied: "2026-05-11", followUpDate: "2026-05-16" },
    { id: 6, company: "Far", status: "Applied", dateApplied: "2026-05-11", followUpDate: "2026-06-16" },
  ];
  const metrics = buildTrackerMetrics(apps, { now: NOW });

  it("lists open interviews soonest first", () => {
    expect(metrics.upcomingInterviews.map((app) => app.company)).toEqual(["Sooner", "Later"]);
    expect(metrics.interviewQueue.map((app) => app.company)).toEqual(["Sooner", "Later", "Past"]);
  });

  it("leads the priority queue with interview prep", () => {
    expect(metrics.nextActions[0].id).toBe("upcoming-interview");
    expect(metrics.nextActions[0].detail).toContain("Sooner, tomorrow");
  });

  it("lists follow-ups coming up in the next week only", () => {
    expect(metrics.upcomingFollowUps.map((app) => app.company)).toEqual(["Chase"]);
  });
});

describe("findDuplicates", () => {
  const apps = [
    { id: 1, company: "Acme Ltd", role: "Analyst", dateApplied: "2026-01-01" },
    { id: 2, company: " acme  ltd ", role: "Data Engineer", dateApplied: "2026-03-01" },
    { id: 3, company: "Other", role: "Analyst", dateApplied: "2026-03-01" },
  ];

  it("matches company ignoring case and spacing, same role first", () => {
    const found = findDuplicates(apps, { company: "ACME LTD", role: "analyst" });
    expect(found.map((item) => [item.app.id, item.sameRole])).toEqual([[1, true], [2, false]]);
  });

  it("excludes the application being edited and blank names", () => {
    expect(findDuplicates(apps, { company: "Other", role: "" }, 3)).toEqual([]);
    expect(findDuplicates(apps, { company: "  ", role: "" })).toEqual([]);
  });
});

describe("date display", () => {
  it("formats ISO dates for reading", () => {
    expect(formatDate("2026-10-01")).toBe("1 Oct 2026");
    expect(formatDate("")).toBe("");
  });

  it("describes dates relative to today", () => {
    expect(relativeDay("2026-05-13", TODAY)).toBe("today");
    expect(relativeDay("2026-05-14", TODAY)).toBe("tomorrow");
    expect(relativeDay("2026-05-16", TODAY)).toBe("in 3 days");
    expect(relativeDay("2026-05-11", TODAY)).toBe("2 days ago");
  });
});

describe("toCSV", () => {
  it("quotes awkward values and defuses formulas", () => {
    const csv = toCSV([{ company: "Acme, Inc", role: "Lead \"Data\" Eng", status: "Applied", notes: "=SUM(A1)" }]);
    const [header, row] = csv.split("\r\n");
    expect(header.startsWith("Company,Role,Status")).toBe(true);
    expect(row).toContain('"Acme, Inc","Lead ""Data"" Eng",Applied');
    expect(row.endsWith("'=SUM(A1)")).toBe(true);
  });
});

describe("buildTimeline", () => {
  it("orders recorded events by date", () => {
    const timeline = buildTimeline({
      status: "Rejected",
      dateApplied: "2026-04-01",
      source: "LinkedIn",
      interviewStartedAt: "2026-04-10",
      rejectedAt: "2026-04-20",
      interviewStage: "2nd Interview",
      followUpHistory: [{ date: "2026-04-08", outcome: "Messaged" }],
    });
    expect(timeline.map((event) => event.label)).toEqual(["Applied", "Follow-up: Messaged", "Interviews started", "Rejected"]);
    expect(timeline[0].detail).toBe("via LinkedIn");
  });
});
