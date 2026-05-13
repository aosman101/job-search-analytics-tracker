import { describe, expect, it } from "vitest";
import { decodeStoredApps, exportPayload } from "./storage";

describe("storage decoding", () => {
  it("decodes raw array backups", () => {
    expect(decodeStoredApps(JSON.stringify([{ id: 1 }]))).toMatchObject({
      apps: [{ id: 1 }],
      format: "array",
    });
  });

  it("decodes versioned export envelopes", () => {
    const payload = exportPayload([{ id: 1 }]);
    expect(decodeStoredApps(JSON.stringify(payload))).toMatchObject({
      apps: [{ id: 1 }],
      format: "envelope",
    });
  });
});
