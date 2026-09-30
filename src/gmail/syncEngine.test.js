import { describe, expect, it } from "vitest";
import { applyEmailEvents, findMatchingApplication } from "./syncEngine";

let counter = 100;
const opts = { makeId: () => ++counter, today: "2026-09-30" };
const event = (overrides) => ({ type: "applied", company: "Monzo", role: "Data Analyst", source: "LinkedIn", date: "2026-09-20", messageId: `m-${Math.random()}`, subject: "s", ...overrides });

describe("applyEmailEvents", () => {
  it("adds a new application from a confirmation email", () => {
    const { apps, changes } = applyEmailEvents([], [event()], opts);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ company: "Monzo", role: "Data Analyst", status: "Applied", dateApplied: "2026-09-20", fromEmail: true, source: "LinkedIn" });
    expect(changes[0]).toMatchObject({ kind: "added", status: "Applied" });
  });

  it("does not duplicate an application that is already tracked", () => {
    const existing = [{ id: 1, company: "Monzo Bank", role: "Data Analyst", status: "Applied", dateApplied: "2026-09-19" }];
    const { apps, changes } = applyEmailEvents(existing, [event()], opts);
    expect(apps).toHaveLength(1);
    expect(changes).toHaveLength(0);
    expect(apps[0].emailLog).toHaveLength(1);
  });

  it("marks the matching application as rejected", () => {
    const existing = [{ id: 1, company: "Monzo", role: "Data Analyst", status: "Applied", dateApplied: "2026-09-01" }];
    const { apps, changes } = applyEmailEvents(existing, [event({ type: "rejected", date: "2026-09-25" })], opts);
    expect(apps[0]).toMatchObject({ status: "Rejected", rejectedAt: "2026-09-25" });
    expect(changes[0]).toMatchObject({ kind: "status", from: "Applied", status: "Rejected" });
  });

  it("revives a ghosted application when a rejection finally arrives", () => {
    const existing = [{ id: 1, company: "Monzo", role: "Data Analyst", status: "Ghosted", dateApplied: "2026-08-01" }];
    const { apps } = applyEmailEvents(existing, [event({ type: "rejected" })], opts);
    expect(apps[0].status).toBe("Rejected");
  });

  it("applies confirmation then rejection in date order within one sync", () => {
    const { apps } = applyEmailEvents([], [
      event({ type: "rejected", date: "2026-09-28", messageId: "b" }),
      event({ type: "applied", date: "2026-09-20", messageId: "a" }),
    ], opts);
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ status: "Rejected", dateApplied: "2026-09-20" });
  });

  it("never downgrades an offer because of a stray rejection", () => {
    const existing = [{ id: 1, company: "Monzo", role: "Data Analyst", status: "Offer", dateApplied: "2026-09-01" }];
    const { apps, changes } = applyEmailEvents(existing, [event({ type: "rejected" })], opts);
    expect(apps[0].status).toBe("Offer");
    expect(changes).toHaveLength(0);
  });

  it("does not create a duplicate when a second rejection arrives", () => {
    const existing = [{ id: 1, company: "Monzo", role: "Data Analyst", status: "Rejected", dateApplied: "2026-09-01" }];
    const { apps } = applyEmailEvents(existing, [event({ type: "rejected" })], opts);
    expect(apps).toHaveLength(1);
  });

  it("moves an application to Interview on an invite", () => {
    const existing = [{ id: 1, company: "Monzo", role: "Data Analyst", status: "Follow-Up", dateApplied: "2026-09-01" }];
    const { apps } = applyEmailEvents(existing, [event({ type: "interview" })], opts);
    expect(apps[0].status).toBe("Interview");
  });
});

describe("findMatchingApplication", () => {
  it("prefers the application whose role overlaps", () => {
    const apps = [
      { id: 1, company: "Monzo", role: "Backend Engineer", status: "Applied", dateApplied: "2026-09-25" },
      { id: 2, company: "Monzo", role: "Data Analyst", status: "Applied", dateApplied: "2026-09-10" },
    ];
    expect(findMatchingApplication(apps, { company: "Monzo", role: "Senior Data Analyst" }).id).toBe(2);
  });

  it("does not match on short partial names", () => {
    const apps = [{ id: 1, company: "Arm", role: "x", status: "Applied" }];
    expect(findMatchingApplication(apps, { company: "Pharmacy Group", role: "" })).toBeNull();
  });
});
