import { useCallback, useState } from "react";
import { DISMISSALS_STORAGE_KEY, parseDismissals, pruneDismissals } from "./utils/dismissals";

function load(today) {
  try {
    return pruneDismissals(parseDismissals(localStorage.getItem(DISMISSALS_STORAGE_KEY)), today);
  } catch {
    return {};
  }
}

function save(map) {
  try {
    localStorage.setItem(DISMISSALS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Private mode or full storage: dismissals still work for this session.
  }
}

/**
 * Dismissed reminders, remembered on this device. A per-device convenience,
 * deliberately kept out of the application data and its backups.
 */
export function useDismissals(today) {
  const [dismissed, setDismissed] = useState(() => load(today));

  const update = useCallback((change) => {
    setDismissed((current) => {
      const next = change(current);
      save(next);
      return next;
    });
  }, []);

  const dismiss = useCallback((keys) => {
    update((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, today])) }));
  }, [today, update]);

  const restore = useCallback((keys) => {
    update((current) => {
      const next = { ...current };
      keys.forEach((key) => { delete next[key]; });
      return next;
    });
  }, [update]);

  const isDismissed = useCallback((key) => Object.hasOwn(dismissed, key), [dismissed]);

  return { isDismissed, dismiss, restore };
}
