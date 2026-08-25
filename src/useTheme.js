import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
  watchSystemTheme,
} from "./theme";

/**
 * Owns the theme preference and keeps <html data-theme> in step with it.
 *
 * Returns the raw preference (what the toggle shows) alongside the resolved
 * theme (what is actually painted), since "system" needs both.
 */
export function useTheme() {
  const [preference, setPreference] = useState(readThemePreference);
  const [resolved, setResolved] = useState(() => resolveTheme(readThemePreference()));

  useEffect(() => {
    const next = resolveTheme(preference);
    setResolved(next);
    applyTheme(next);
  }, [preference]);

  // Only follow the OS while the user hasn't pinned a theme.
  useEffect(() => {
    if (preference !== "system") return undefined;
    return watchSystemTheme((next) => {
      setResolved(next);
      applyTheme(next);
    });
  }, [preference]);

  const setTheme = useCallback((next) => {
    setPreference(next);
    storeThemePreference(next);
  }, []);

  // Cycles light → dark → system so all three stay reachable from one control.
  const cycleTheme = useCallback(() => {
    setPreference((current) => {
      const next = current === "light" ? "dark" : current === "dark" ? "system" : "light";
      storeThemePreference(next);
      return next;
    });
  }, []);

  return { preference, resolved, setTheme, cycleTheme };
}
