import { describe, expect, it } from "vitest";
import { filterApplications, needsAttention, sortApplications } from "./applicationFilters";

const today = "2026-05-13";

const acme = {
  id: 1,
  company: "Acme",
  role: "Data Engineer",
  location: "London",
  source: "LinkedIn",
  status: "Applied",
  dateApplied: "2026-05-01",
};
const globex = {
  id: 2,
  company: "Globex",
  role: "Analytics Engineer",
  location: "Remote",
  source: "Referral",
  status: "Interview",
  dateApplied: "2026-05-10",
};
const initech = {
  id: 3,
  company: "Initech",
  role: "Data Engineer",
  location: "Manchester",
  source: "Recruiter",
  status: "Rejected",
  dateApplied: "2026-04-02",
};

const apps = [acme, globex, initech];

describe("filterApplications", () => {
  it("returns everything when no filters are applied", () => {
    expect(filterApplications(apps, {}, today)).toHaveLength(3);
  });

  it("filters by status", () => {
    const result = filterApplications(apps, { status: "Interview" }, today);
    expect(result.map((a) => a.company)).toEqual(["Globex"]);
  });

  it("treats the All status as no status filter", () => {
    expect(filterApplications(apps, { status: "All" }, today)).toHaveLength(3);
  });

  it("filters by source", () => {
    const result = filterApplications(apps, { source: "Referral" }, today);
    expect(result.map((a) => a.company)).toEqual(["Globex"]);
  });

  it("searches across company, role, location and source", () => {
    expect(filterApplications(apps, { search: "acme" }, today)).toHaveLength(1);
    expect(filterApplications(apps, { search: "data engineer" }, today)).toHaveLength(2);
    expect(filterApplications(apps, { search: "manchester" }, today)).toHaveLength(1);
    expect(filterApplications(apps, { search: "recruiter" }, today)).toHaveLength(1);
  });

  it("ignores surrounding whitespace and case in search", () => {
    expect(filterApplications(apps, { search: "  GLOBEX  " }, today)).toHaveLength(1);
  });

  it("combines filters with AND semantics", () => {
    const result = filterApplications(
      apps,
      { status: "Applied", search: "data" },
      today,
    );
    expect(result.map((a) => a.company)).toEqual(["Acme"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterApplications(apps, { search: "nothing-here" }, today)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...apps];
    filterApplications(input, { status: "Interview" }, today);
    expect(input).toEqual(apps);
  });
});

describe("needsAttention", () => {
  it("flags an application with an overdue follow-up", () => {
    expect(needsAttention({ ...acme, followUpDate: "2026-05-12" }, today)).toBe(true);
  });

  it("flags a follow-up that is due exactly today", () => {
    expect(needsAttention({ ...acme, followUpDate: today }, today)).toBe(true);
  });

  it("does not flag a follow-up that is still in the future", () => {
    expect(needsAttention({ ...acme, followUpDate: "2026-05-20" }, today)).toBe(false);
  });

  it("does not flag a follow-up that has already been actioned", () => {
    expect(
      needsAttention({ ...acme, followUpDate: "2026-05-12", followUpStatus: "messaged" }, today),
    ).toBe(false);
  });

  it("does not flag closed applications even when the follow-up is overdue", () => {
    expect(
      needsAttention({ ...initech, followUpDate: "2026-05-12" }, today),
    ).toBe(false);
  });

  it("flags applications close to ghosting", () => {
    // GHOST_DAYS is 21; applied 2026-04-25 is 18 days before today, so 3 days remain.
    expect(needsAttention({ ...acme, dateApplied: "2026-04-25" }, today)).toBe(true);
  });

  it("does not flag a freshly applied application", () => {
    expect(needsAttention({ ...acme, dateApplied: "2026-05-12" }, today)).toBe(false);
  });
});

describe("filterApplications with needsAttention", () => {
  it("keeps only applications that need attention", () => {
    const overdue = { ...acme, followUpDate: "2026-05-01" };
    const result = filterApplications([overdue, globex, initech], { needsAttention: true }, today);
    expect(result.map((a) => a.company)).toEqual(["Acme"]);
  });
});

describe("sortApplications", () => {
  it("sorts by date applied, newest first", () => {
    expect(sortApplications(apps, "date").map((a) => a.company)).toEqual([
      "Globex",
      "Acme",
      "Initech",
    ]);
  });

  it("sorts by company name", () => {
    expect(sortApplications(apps, "company").map((a) => a.company)).toEqual([
      "Acme",
      "Globex",
      "Initech",
    ]);
  });

  it("sorts by status", () => {
    expect(sortApplications(apps, "status").map((a) => a.status)).toEqual([
      "Applied",
      "Interview",
      "Rejected",
    ]);
  });

  it("sorts by company when dates are missing", () => {
    const undated = [
      { ...acme, dateApplied: "" },
      { ...globex, dateApplied: "" },
    ];
    expect(sortApplications(undated, "date")).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const input = [...apps];
    sortApplications(input, "company");
    expect(input).toEqual(apps);
  });

  it("falls back to the original order for an unknown sort key", () => {
    expect(sortApplications(apps, "nope").map((a) => a.id)).toEqual([1, 2, 3]);
  });
});
