import { describe, expect, it } from "vitest";
import { dismissKey, dueBannerKey, parseDismissals, pruneDismissals } from "./dismissals";

const app = { id: 7, status: "Applied", dateApplied: "2026-11-01", followUpDate: "2026-11-10", followUpHistory: [] };

describe("dismissKey", () => {
  it("changes when the follow-up is rescheduled, so a new reminder shows again", () => {
    const before = dismissKey("due", app);
    const after = dismissKey("due", { ...app, followUpDate: "2026-11-17" });
    expect(before).not.toBe(after);
  });

  it("changes when an interview moves stage or date", () => {
    const interview = { ...app, status: "Interview", interviewStage: "1st Interview", interviewDate: "2026-11-20" };
    expect(dismissKey("interviews", interview)).not.toBe(dismissKey("interviews", { ...interview, interviewStage: "2nd Interview" }));
    expect(dismissKey("interviews", interview)).not.toBe(dismissKey("interviews", { ...interview, interviewDate: "2026-11-21" }));
  });

  it("changes when a ghost-risk application gets a new follow-up logged", () => {
    const logged = { ...app, followUpHistory: [{ date: "2026-11-12" }] };
    expect(dismissKey("risk", app)).not.toBe(dismissKey("risk", logged));
  });

  it("keeps agenda entries for the same app distinct by kind and date", () => {
    expect(dismissKey("week", app, "Interview|2026-11-20")).not.toBe(dismissKey("week", app, "Follow-up|2026-11-20"));
  });

  it("is stable for unchanged input", () => {
    expect(dismissKey("unplanned", app)).toBe(dismissKey("unplanned", { ...app }));
  });
});

describe("dueBannerKey", () => {
  it("is order-independent but resets the next day or when a new follow-up falls due", () => {
    const a = { id: 1 }, b = { id: 2 }, c = { id: 3 };
    expect(dueBannerKey([a, b], "2026-11-17")).toBe(dueBannerKey([b, a], "2026-11-17"));
    expect(dueBannerKey([a, b], "2026-11-17")).not.toBe(dueBannerKey([a, b], "2026-11-18"));
    expect(dueBannerKey([a, b], "2026-11-17")).not.toBe(dueBannerKey([a, b, c], "2026-11-17"));
  });
});

describe("parseDismissals", () => {
  it("returns an empty map for missing or corrupt storage", () => {
    expect(parseDismissals(null)).toEqual({});
    expect(parseDismissals("not json")).toEqual({});
    expect(parseDismissals("[1,2]")).toEqual({});
  });

  it("drops entries that are not ISO dates", () => {
    expect(parseDismissals(JSON.stringify({ ok: "2026-11-17", bad: 5, worse: "yesterday" }))).toEqual({ ok: "2026-11-17" });
  });
});

describe("pruneDismissals", () => {
  it("forgets dismissals older than the retention window", () => {
    const map = { fresh: "2026-11-10", stale: "2026-08-01" };
    expect(pruneDismissals(map, "2026-11-17")).toEqual({ fresh: "2026-11-10" });
  });
});
