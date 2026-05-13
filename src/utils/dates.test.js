import { describe, expect, it } from "vitest";
import { addDays, daysBetween, daysSince, todayISO } from "./dates";

describe("date helpers", () => {
  it("formats local dates without UTC conversion", () => {
    expect(todayISO(new Date(2026, 4, 13, 23, 30))).toBe("2026-05-13");
  });

  it("calculates whole local-day differences", () => {
    expect(daysBetween("2026-05-01", "2026-05-13")).toBe(12);
  });

  it("calculates days since using the provided clock", () => {
    expect(daysSince("2026-05-10", new Date(2026, 4, 13, 8))).toBe(3);
  });

  it("adds days to local ISO dates", () => {
    expect(addDays("2026-05-13", 7)).toBe("2026-05-20");
  });
});
