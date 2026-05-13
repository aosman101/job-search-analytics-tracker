import { describe, expect, it } from "vitest";
import { applyStatusTransition, autoGhost, normalizeApplication } from "./applicationLifecycle";

describe("application lifecycle", () => {
  it("adds lifecycle fields to existing applications", () => {
    const app = normalizeApplication({
      id: 1,
      company: "Acme",
      dateApplied: "2026-04-01",
      status: "Rejected",
    }, "2026-05-13");

    expect(app.createdAt).toBe("2026-04-01");
    expect(app.rejectedAt).toBe("2026-04-01");
    expect(app.followUpHistory).toEqual([]);
  });

  it("sets stable status transition timestamps", () => {
    const app = applyStatusTransition({
      id: 1,
      status: "Applied",
      dateApplied: "2026-05-01",
    }, "Interview", "2026-05-13");

    expect(app.status).toBe("Interview");
    expect(app.statusUpdatedAt).toBe("2026-05-13");
    expect(app.interviewStartedAt).toBe("2026-05-13");
  });

  it("auto-ghosts old applied applications", () => {
    const [app] = autoGhost([{ id: 1, status: "Applied", dateApplied: "2026-04-01" }], "2026-05-13");

    expect(app.status).toBe("Ghosted");
    expect(app.ghostedAt).toBe("2026-05-13");
    expect(app.autoGhosted).toBe(true);
  });
});
