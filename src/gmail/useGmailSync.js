import { useCallback, useEffect, useRef, useState } from "react";
import { todayISO } from "../utils/dates";
import { classifyEmail } from "./emailClassifier";
import {
  clearCachedToken,
  fetchJobEmails,
  fetchViaBridge,
  fetchProfileEmail,
  readCachedToken,
  readGmailSettings,
  requestAccessToken,
  revokeAccess,
  writeGmailSettings,
} from "./gmailClient";
import { applyEmailEvents } from "./syncEngine";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
// Re-scan a little before the last sync so mail that arrived late (or with a
// skewed timestamp) is not missed; processed ids stop it being applied twice.
const RESYNC_OVERLAP_MS = 2 * DAY_MS;

function makeId() {
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; }
  catch (_) { return Date.now() + Math.floor(Math.random() * 100000); }
}

export function summarizeChanges(changes) {
  const added = changes.filter((c) => c.kind === "added").length;
  const rejected = changes.filter((c) => c.kind === "status" && c.status === "Rejected").length;
  const interviews = changes.filter((c) => c.kind === "status" && c.status === "Interview").length;
  const parts = [];
  if (added) parts.push(`${added} added`);
  if (rejected) parts.push(`${rejected} marked rejected`);
  if (interviews) parts.push(`${interviews} moved to interview`);
  return parts.length ? parts.join(", ") : "no new updates";
}

/**
 * Owns Gmail connection state and runs syncs against the tracker.
 *
 * `getApps` reads the latest list at the moment a sync lands (a sync can take
 * several seconds, during which the user may edit), and `commitApps` writes
 * and persists the result.
 */
export function useGmailSync({ getApps, commitApps, onResult }) {
  const [settings, setSettings] = useState(readGmailSettings);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const settingsRef = useRef(settings);
  const syncingRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const saveSettings = useCallback((patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    writeGmailSettings(next);
  }, []);

  const sync = useCallback(async ({ interactive = false, lookbackDays = 90 } = {}) => {
    if (syncingRef.current) return null;
    const current = settingsRef.current;
    const bridge = Boolean(current.bridgeUrl && current.bridgeKey);
    let token = bridge ? null : readCachedToken();
    if (!bridge && !token && !interactive) return null;

    syncingRef.current = true;
    setSyncing(true);
    setError("");
    setProgress(null);
    try {
      const startedAt = Date.now();
      const sinceMs = current.lastSyncAt ? current.lastSyncAt - RESYNC_OVERLAP_MS : startedAt - lookbackDays * DAY_MS;
      const skipIds = new Set(current.processedIds);
      let email = current.email;
      let emails;
      if (bridge) {
        const result = await fetchViaBridge(current.bridgeUrl, current.bridgeKey, { sinceMs, skipIds });
        emails = result.emails;
        email = result.account || email;
      } else {
        if (!token) token = await requestAccessToken(current.clientId, { hint: current.email });
        email = email || await fetchProfileEmail(token);
        emails = await fetchJobEmails(token, {
          sinceMs,
          skipIds,
          onProgress: (done, total) => setProgress({ done, total }),
        });
      }
      const events = emails.map(classifyEmail).filter(Boolean);
      const before = getApps();
      const { apps: next, changes } = applyEmailEvents(before, events, { makeId, today: todayISO() });
      if (events.length > 0) commitApps(next);

      const entry = { at: startedAt, scanned: emails.length, matched: events.length, changes };
      saveSettings({
        connected: true,
        email,
        lastSyncAt: startedAt,
        processedIds: [...current.processedIds, ...emails.map((e) => e.id)],
        log: changes.length > 0 ? [entry, ...current.log] : current.log,
      });
      onResultRef.current?.({ changes, before, scanned: emails.length, interactive });
      return changes;
    } catch (err) {
      if (err.code === "auth") saveSettings({ connected: true });
      setError(err.message || "Gmail sync failed.");
      if (interactive) onResultRef.current?.({ error: err.message || "Gmail sync failed.", interactive });
      return null;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setProgress(null);
    }
  }, [commitApps, getApps, saveSettings]);

  // Background sync: once on load, every 15 minutes, and when the tab comes
  // back into view. The Apps Script bridge can always run; the browser-token
  // flow only while its token is valid, since a popup opened without a click
  // would be blocked.
  const bridgeReady = Boolean(settings.bridgeUrl && settings.bridgeKey);
  useEffect(() => {
    if (!settings.autoSync || (!settings.connected && !bridgeReady)) return undefined;
    const run = () => { if (bridgeReady || readCachedToken()) sync(); };
    run();
    const timer = setInterval(run, AUTO_SYNC_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [settings.connected, settings.autoSync, bridgeReady, sync]);

  const disconnect = useCallback(() => {
    revokeAccess();
    clearCachedToken();
    // Processed ids and the sync cursor survive a disconnect so reconnecting
    // later doesn't resurrect applications you already deleted or undid.
    saveSettings({ connected: false, email: "", bridgeUrl: "" });
    setError("");
  }, [saveSettings]);

  return {
    settings,
    syncing,
    progress,
    error,
    hasSession: Boolean(readCachedToken()),
    sync,
    disconnect,
    setClientId: (clientId) => saveSettings({ clientId: clientId.trim() }),
    setAutoSync: (autoSync) => saveSettings({ autoSync }),
    bridgeReady,
    setBridge: (bridgeUrl, bridgeKey) => saveSettings({ bridgeUrl: bridgeUrl.trim(), bridgeKey, connected: Boolean(bridgeUrl) }),
  };
}
