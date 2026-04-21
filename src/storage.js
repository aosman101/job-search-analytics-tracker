// ---------------------------------------------------------------------------
// Storage layer — IndexedDB primary (50 MB+), localStorage fallback (5 MB)
// ---------------------------------------------------------------------------

export const STORAGE_KEY = "adil-job-tracker-v2";
export const STORAGE_BACKUP_KEY = `${STORAGE_KEY}:backup`;
export const STORAGE_CORRUPT_KEY = `${STORAGE_KEY}:corrupt`;

const IDB_NAME = "adil-job-tracker-db";
const IDB_STORE = "tracker";

export function isQuotaError(error) {
  if (!error) return false;
  return (
    error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

function openIDB() {
  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close?.();
    tx.onabort = () => db.close?.();
  });
}

async function idbSet(key, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => {
      db.close?.();
      resolve(true);
    };
    tx.onerror = () => {
      db.close?.();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close?.();
      reject(tx.error);
    };
  });
}

export async function safeStorageCandidates(key) {
  const candidates = [];

  try {
    const primary = await idbGet(key);
    if (typeof primary === "string" && primary.length > 0) {
      candidates.push({ source: "indexeddb", key, value: primary });
    }
  } catch (error) {
    candidates.push({ source: "indexeddb", key, error });
  }

  for (const localKey of [key, STORAGE_BACKUP_KEY]) {
    try {
      const value = localStorage.getItem(localKey);
      if (typeof value === "string" && value.length > 0) {
        candidates.push({ source: "localStorage", key: localKey, value });
      }
    } catch (error) {
      candidates.push({ source: "localStorage", key: localKey, error });
    }
  }

  return candidates;
}

export async function safeStorageSet(key, value) {
  const result = {
    ok: false,
    primary: null,
    fallback: null,
    quotaExceeded: false,
    errors: [],
  };

  try {
    await idbSet(key, value);
    result.ok = true;
    result.primary = "indexeddb";
  } catch (error) {
    result.errors.push(error);
    if (isQuotaError(error)) result.quotaExceeded = true;
  }

  const localTarget = result.primary === "indexeddb" ? STORAGE_BACKUP_KEY : key;
  try {
    localStorage.setItem(localTarget, value);
    result.fallback = "localStorage";
    if (!result.ok) {
      result.ok = true;
      result.primary = "localStorage";
    }
  } catch (error) {
    result.errors.push(error);
    if (isQuotaError(error)) result.quotaExceeded = true;
  }

  return result;
}

// Migrate: if data exists only in localStorage, copy it into IndexedDB once.
export async function migrateToIDB() {
  try {
    const existing = await idbGet(STORAGE_KEY);
    if (existing) return;
    const lsData = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_BACKUP_KEY);
    if (lsData) await idbSet(STORAGE_KEY, lsData);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Serialized write queue — prevents race conditions from rapid updates
// ---------------------------------------------------------------------------

export function createSaveQueue({ onComplete, onError }) {
  let pending = null;
  let running = false;

  async function flush() {
    if (running || pending === null) return;
    running = true;
    const data = pending;
    pending = null;
    try {
      const result = await safeStorageSet(STORAGE_KEY, data);
      if (onComplete) await onComplete(result, data);
      if (!result.ok && onError) onError(result);
    } catch (error) {
      if (onError) onError(error);
    }
    running = false;
    if (pending !== null) flush();
  }

  return function enqueue(jsonString) {
    pending = jsonString;
    flush();
  };
}

// ---------------------------------------------------------------------------
// Decoding, sizing, export payload, and corrupt-data capture
// ---------------------------------------------------------------------------

export function decodeStoredApps(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { apps: parsed, recovered: false, format: "array" };
    if (parsed && Array.isArray(parsed.apps)) return { apps: parsed.apps, recovered: false, format: "envelope" };
  } catch (_) {}
  // Attempt recovery from truncated JSON: find the last complete object
  try {
    const lastBrace = raw.lastIndexOf("}");
    if (lastBrace > 0) {
      const trimmed = raw.slice(0, lastBrace + 1) + "]";
      const recovered = JSON.parse(trimmed);
      if (Array.isArray(recovered)) return { apps: recovered, recovered: true, format: "recovered-array" };
    }
  } catch (_) {}
  return null;
}

export function storageSize(data) {
  try { return new Blob([data]).size; } catch (_) { return data.length * 2; }
}

export function exportPayload(apps) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: "JobTrackerV2",
    apps,
  };
}

export async function storeCorruptPayload(raw, meta = {}) {
  if (!raw) return;
  const payload = JSON.stringify({
    capturedAt: new Date().toISOString(),
    ...meta,
    raw,
  });
  try { await idbSet(STORAGE_CORRUPT_KEY, payload); } catch (_) {}
  try { localStorage.setItem(STORAGE_CORRUPT_KEY, payload); } catch (_) {}
}
