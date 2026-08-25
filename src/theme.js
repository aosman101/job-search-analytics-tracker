/**
 * Theme resolution and persistence.
 *
 * Three user-facing choices — "light", "dark", "system" — resolve down to two
 * applied themes. "system" follows the OS and keeps following it, so a user who
 * never opts in gets whatever their machine is set to, including later changes.
 *
 * The applied theme is stamped on <html> as data-theme so CSS can key off it,
 * and index.html runs the same resolution inline before first paint to avoid a
 * flash of the wrong theme.
 */

export const THEME_KEY = "adil-job-tracker-theme";

export const THEME_OPTIONS = ["light", "dark", "system"];

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Read the stored preference, falling back to "system" when unset or invalid. */
export function readThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEME_OPTIONS.includes(stored) ? stored : "system";
  } catch (_) {
    // Private mode or blocked storage — behave as if nothing was ever stored.
    return "system";
  }
}

export function storeThemePreference(preference) {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch (_) {
    // Preference is best-effort; the applied theme still works for this session.
  }
}

export function prefersDark() {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;
}

/** Collapse a preference into the theme actually applied to the document. */
export function resolveTheme(preference) {
  if (preference === "light" || preference === "dark") return preference;
  return prefersDark() ? "dark" : "light";
}

export function applyTheme(resolved) {
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  // Keeps form controls, scrollbars, and the browser's own UI in step.
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0b0e14" : "#173756");
}

/**
 * Subscribe to OS theme changes. Only meaningful while the preference is
 * "system"; callers unsubscribe when the user picks an explicit theme.
 */
export function watchSystemTheme(onChange) {
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia(DARK_QUERY);
  const handler = (event) => onChange(event.matches ? "dark" : "light");
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}
