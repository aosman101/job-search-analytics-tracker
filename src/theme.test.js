import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, readThemePreference, resolveTheme, storeThemePreference } from "./theme";

function mockMatchMedia(matches) {
  globalThis.matchMedia = vi.fn(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe("theme preference", () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to system when nothing is stored", () => {
    expect(readThemePreference()).toBe("system");
  });

  it("round-trips a stored preference", () => {
    storeThemePreference("dark");
    expect(readThemePreference()).toBe("dark");
  });

  it("rejects a stored value that is not a known option", () => {
    localStorage.setItem(THEME_KEY, "chartreuse");
    expect(readThemePreference()).toBe("system");
  });

  it("falls back to system when storage throws", () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readThemePreference()).toBe("system");
    // Persisting must not surface the storage failure to the caller.
    expect(() => storeThemePreference("dark")).not.toThrow();
  });
});

describe("resolveTheme", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an explicit preference unchanged, ignoring the OS", () => {
    mockMatchMedia(true);
    expect(resolveTheme("light")).toBe("light");
    mockMatchMedia(false);
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("follows the OS when the preference is system", () => {
    mockMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
    mockMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("resolves to light when matchMedia is unavailable", () => {
    globalThis.matchMedia = undefined;
    expect(resolveTheme("system")).toBe("light");
  });
});
