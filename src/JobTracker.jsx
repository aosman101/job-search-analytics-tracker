import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { Home as HomeIcon, Search as SearchIcon, Route as RouteIcon, BarChart3 as BarChartIcon, Target as TargetIcon } from "lucide-react";

const InterviewPrep = lazy(() => import("./InterviewPrep"));

const STORAGE_KEY = "adil-job-tracker-v2";
const STORAGE_BACKUP_KEY = `${STORAGE_KEY}:backup`;
const STORAGE_CORRUPT_KEY = `${STORAGE_KEY}:corrupt`;
const IDB_NAME = "adil-job-tracker-db";
const IDB_STORE = "tracker";
const GHOST_DAYS = 21;

const STATUS_CONFIG = {
  Applied:     { color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", emoji: "📤" },
  "Follow-Up": { color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", emoji: "🔔" },
  Interview:   { color: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE", emoji: "🗣️" },
  Offer:       { color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", emoji: "🎉" },
  Rejected:    { color: "#EF4444", bg: "#FEF2F2", border: "#FECACA", emoji: "❌" },
  Ghosted:     { color: "#9CA3AF", bg: "#F9FAFB", border: "#E5E7EB", emoji: "👻" },
  Withdrawn:   { color: "#6B7280", bg: "#F3F4F6", border: "#D1D5DB", emoji: "↩️" },
};

const TABS = [
  { id: "Home", icon: HomeIcon, label: "Home", description: "Welcome, priorities, and search guidance" },
  { id: "Job Search", icon: SearchIcon, label: "Job Search", description: "Track applications and manage search activity" },
  { id: "Pipeline", icon: RouteIcon, label: "Pipeline", description: "Follow-ups, interviews, and ghost-risk items" },
  { id: "Analytics", icon: BarChartIcon, label: "Analytics", description: "Performance, outcomes, and momentum trends" },
  { id: "Interview Prep", icon: TargetIcon, label: "Interview Prep", description: "Role-specific prep, study guides, and stage-aware tips" },
];
const INTERVIEW_STAGES = ["", "1st Interview", "2nd Interview", "3rd Interview", "Home Assignment", "Final Interview"];
const EMPTY_FORM = { company: "", role: "", location: "", dateApplied: "", status: "Applied", jobUrl: "", hiringManager: "", hmLinkedIn: "", followUpDate: "", notes: "", interviewStage: "", followUpStatus: "", hmAvailable: true, hmLinkedInAvailable: true };

const FOLLOWUP_STATUS = {
  "":               { label: "Pending",          color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", emoji: "🔔" },
  "messaged":       { label: "Messaged ✓",        color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", emoji: "✅" },
  "premium":        { label: "Premium Required",  color: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE", emoji: "🔒" },
  "no_linkedin":    { label: "No LinkedIn",       color: "#6B7280", bg: "#F3F4F6", border: "#D1D5DB", emoji: "🚫" },
  "email_instead":  { label: "Emailed Instead",   color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", emoji: "📧" },
};

// ---------------------------------------------------------------------------
// Storage layer — IndexedDB primary (50 MB+), localStorage fallback (5 MB)
// ---------------------------------------------------------------------------

function isQuotaError(error) {
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

async function safeStorageCandidates(key) {
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

async function safeStorageSet(key, value) {
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
async function migrateToIDB() {
  try {
    const existing = await idbGet(STORAGE_KEY);
    if (existing) return; // already migrated
    const lsData = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_BACKUP_KEY);
    if (lsData) await idbSet(STORAGE_KEY, lsData);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Serialized write queue — prevents race conditions from rapid updates
// ---------------------------------------------------------------------------

function createSaveQueue({ onComplete, onError }) {
  let pending = null;   // latest data waiting to be written
  let running = false;  // whether a write is in progress

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
    if (pending !== null) flush(); // drain anything queued while we were writing
  }

  return function enqueue(jsonString) {
    pending = jsonString;
    flush();
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isTodayWeekend() {
  return isWeekend(new Date());
}

function ensureIds(apps) {
  let maxId = apps.reduce((m, a) => Math.max(m, typeof a.id === "number" ? a.id : 0), 0);
  return apps.map(a => {
    if (a.id != null) return a;
    maxId += 1;
    return { ...a, id: maxId };
  });
}

function autoGhost(apps) {
  return apps.map(a =>
    ["Applied", "Follow-Up"].includes(a.status) && daysSince(a.dateApplied) >= GHOST_DAYS
      ? { ...a, status: "Ghosted", autoGhosted: true }
      : a
  );
}

function findNewlyGhosted(before, after) {
  const beforeMap = new Map(before.map(a => [a.id, a.status]));
  return after.filter(a => a.status === "Ghosted" && beforeMap.get(a.id) !== "Ghosted");
}

function decodeStoredApps(raw) {
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

function storageSize(data) {
  try { return new Blob([data]).size; } catch (_) { return data.length * 2; }
}

function exportPayload(apps) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: "JobTrackerV2",
    apps,
  };
}

async function storeCorruptPayload(raw, meta = {}) {
  if (!raw) return;
  const payload = JSON.stringify({
    capturedAt: new Date().toISOString(),
    ...meta,
    raw,
  });
  try { await idbSet(STORAGE_CORRUPT_KEY, payload); } catch (_) {}
  try { localStorage.setItem(STORAGE_CORRUPT_KEY, payload); } catch (_) {}
}

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------

function Badge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Applied"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {cfg.emoji} {status.toUpperCase()}
    </span>
  );
}

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 660, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 30px 70px rgba(0,0,0,0.25)" }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required, as, options, rows }) {
  const base = { width: "100%", padding: "9px 12px", border: "1.5px solid #E5E7EB", borderRadius: 8, fontSize: 13, color: "#111827", outline: "none", fontFamily: "inherit", background: "#FAFAFA", boxSizing: "border-box" };
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6B7280", marginBottom: 4, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: "#EF4444" }}> *</span>}
      </label>
      {as === "select" ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...base, cursor: "pointer" }}>
          {options.map(o => <option key={o} value={o}>{o || "— None —"}</option>)}
        </select>
      ) : as === "textarea" ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows || 3} style={{ ...base, resize: "vertical" }} onFocus={e => e.target.style.borderColor = "#1F4E79"} onBlur={e => e.target.style.borderColor = "#E5E7EB"} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={base} onFocus={e => e.target.style.borderColor = "#1F4E79"} onBlur={e => e.target.style.borderColor = "#E5E7EB"} />
      )}
    </div>
  );
}

function SectionCard({ title, subtitle, actions = null, children, style = {} }) {
  return (
    <section style={{ background: "#fff", borderRadius: 16, padding: "18px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1.5px solid #E5E7EB", ...style }}>
      {(title || subtitle || actions) && (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            {title && <h3 style={{ margin: 0, color: "#1F4E79", fontSize: 15, fontFamily: "Georgia,serif" }}>{title}</h3>}
            {subtitle && <p style={{ margin: title ? "4px 0 0" : 0, color: "#6B7280", fontSize: 12, lineHeight: 1.5 }}>{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

function SankeyFunnel({ apps }) {
  const stages = [
    { label: "Applied", count: apps.length, color: "#3B82F6" },
    { label: "1st Interview", count: apps.filter(a => a.interviewStage && a.interviewStage !== "").length, color: "#8B5CF6" },
    { label: "2nd+ Interview", count: apps.filter(a => ["2nd Interview","3rd Interview","Home Assignment","Final Interview"].includes(a.interviewStage)).length, color: "#EC4899" },
    { label: "Final Round", count: apps.filter(a => ["Final Interview","Home Assignment"].includes(a.interviewStage)).length, color: "#F59E0B" },
    { label: "Offer", count: apps.filter(a => a.status === "Offer").length, color: "#10B981" },
  ];
  const maxCount = stages[0].count || 1;
  const W = 600, H = 220, padX = 60, barW = 60, gap = (W - padX * 2 - barW * stages.length) / (stages.length - 1);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H + 60}`} style={{ width: "100%", maxWidth: W, display: "block", margin: "0 auto" }}>
        {stages.map((s, i) => {
          const x = padX + i * (barW + gap);
          const barH = Math.max(8, (s.count / maxCount) * (H - 40));
          const y = (H - barH) / 2 + 10;
          const next = stages[i + 1];
          return (
            <g key={s.label}>
              {next && (() => {
                const nx = x + barW + gap;
                const nextH = Math.max(8, (next.count / maxCount) * (H - 40));
                const ny = (H - nextH) / 2 + 10;
                const midX = (x + barW + nx) / 2;
                return <path d={`M ${x+barW} ${y} C ${midX} ${y}, ${midX} ${ny}, ${nx} ${ny} L ${nx} ${ny+nextH} C ${midX} ${ny+nextH}, ${midX} ${y+barH}, ${x+barW} ${y+barH} Z`} fill={s.color} fillOpacity={0.15} />;
              })()}
              <rect x={x} y={y} width={barW} height={barH} rx={6} fill={s.color} />
              <text x={x+barW/2} y={y-8} textAnchor="middle" fontSize={15} fontWeight={800} fill={s.color}>{s.count}</text>
              <text x={x+barW/2} y={H+30} textAnchor="middle" fontSize={10} fill="#6B7280" fontWeight={600}>{s.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function JobTracker({ initialApps = [], onLogout = null }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Home");
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filterStatus, setFilterStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [sortBy, setSortBy] = useState("date");
  const [ghostedBanner, setGhostedBanner] = useState([]);
  const [dismissedFollowUps, setDismissedFollowUps] = useState(new Set());
  const [storageHealth, setStorageHealth] = useState("ok"); // "ok" | "warn" | "error"
  const [storageBackend, setStorageBackend] = useState("IndexedDB");
  const [storageMessage, setStorageMessage] = useState("Ready");

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  // Serialized save queue — only the latest state wins, no races
  const saveQueueRef = useRef(null);
  if (!saveQueueRef.current) {
    saveQueueRef.current = createSaveQueue({
      onComplete: (result, data) => {
        const bytes = storageSize(data);
        if (!result.ok) {
          setStorageHealth("error");
          setStorageBackend("Unavailable");
          setStorageMessage("Writes are failing. Export a backup now.");
          return;
        }
        const backendLabel = result.primary === "indexeddb" ? "IndexedDB" : "localStorage";
        setStorageBackend(backendLabel);
        if (result.primary === "localStorage") {
          setStorageHealth("warn");
          setStorageMessage("Running on localStorage fallback.");
        } else if (result.quotaExceeded || bytes > 4 * 1024 * 1024) {
          setStorageHealth("warn");
          setStorageMessage("Storage usage is high. Export a backup.");
        } else {
          setStorageHealth("ok");
          setStorageMessage("Healthy");
        }
      },
      onError: (error) => {
        setStorageHealth("error");
        setStorageBackend("Unavailable");
        setStorageMessage(isQuotaError(error) ? "Storage quota exceeded." : "Storage write failed.");
        showToast("Storage write failed — export your data as backup!", "error");
      },
    });
  }

  const persistToStorage = useCallback((updated) => {
    const data = JSON.stringify(exportPayload(updated));
    saveQueueRef.current(data);
  }, []);

  // Load on mount — with migration, recovery, and validation
  useEffect(() => {
    const fallback = setTimeout(() => setLoading(false), 5000);
    (async () => {
      try {
        await migrateToIDB();
        const seededApps = autoGhost(ensureIds(initialApps));
        const candidates = await safeStorageCandidates(STORAGE_KEY);
        const corruptCandidates = [];
        let resolved = null;

        for (const candidate of candidates) {
          if (typeof candidate.value !== "string") continue;
          const decoded = decodeStoredApps(candidate.value);
          if (decoded?.apps) {
            resolved = { candidate, decoded };
            break;
          }
          corruptCandidates.push(candidate);
        }

        if (resolved) {
          const withIds = ensureIds(resolved.decoded.apps);
          const ghosted = autoGhost(withIds);
          const newlyGhosted = findNewlyGhosted(withIds, ghosted);
          setApps(ghosted);

          if (newlyGhosted.length > 0) {
            setGhostedBanner(newlyGhosted);
          }

          if (resolved.candidate.source === "indexeddb") {
            setStorageBackend("IndexedDB");
            if (resolved.decoded.recovered) {
              setStorageHealth("warn");
              setStorageMessage("Recovered and repaired stored data.");
            } else {
              setStorageHealth("ok");
              setStorageMessage("Healthy");
            }
          } else {
            setStorageBackend("localStorage");
            setStorageHealth("warn");
            setStorageMessage("Recovered from localStorage fallback.");
          }

          if (resolved.decoded.recovered || resolved.candidate.source !== "indexeddb" || newlyGhosted.length > 0) {
            persistToStorage(ghosted);
          }

          if (corruptCandidates.length > 0) {
            await storeCorruptPayload(corruptCandidates[0].value, {
              source: corruptCandidates[0].source,
              key: corruptCandidates[0].key,
              reason: "load-fallback-used",
            });
          }
        } else if (seededApps.length > 0) {
          setApps(seededApps);
          persistToStorage(seededApps);
          setStorageBackend("IndexedDB");
          setStorageHealth("ok");
          setStorageMessage("Starter dataset loaded.");
        } else if (corruptCandidates.length > 0) {
          await storeCorruptPayload(corruptCandidates[0].value, {
            source: corruptCandidates[0].source,
            key: corruptCandidates[0].key,
            reason: "no-valid-storage-candidate",
          });
          setStorageHealth("error");
          setStorageBackend(corruptCandidates[0].source === "indexeddb" ? "IndexedDB" : "localStorage");
          setStorageMessage("Stored data is corrupt. Import a backup.");
          showToast("Stored data is corrupted. Import a backup or export the recovery copy.", "error");
        }
      } catch (err) {
        console.error("JobTracker load error:", err);
        setStorageHealth("error");
        setStorageBackend("Unavailable");
        setStorageMessage("Storage failed to initialize.");
      }
      clearTimeout(fallback);
      setLoading(false);
    })();
  }, [initialApps, persistToStorage]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = k => v => setForm(p => ({ ...p, [k]: v }));
  const [formError, setFormError] = useState("");

  // Stable ID generator — crypto random to avoid Date.now() collisions
  const nextId = () => {
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; }
    catch (_) { return Date.now() + Math.floor(Math.random() * 100000); }
  };

  const appById = (id) => apps.find(a => a.id === id) || null;

  const handleSubmit = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!form.company.trim() || !form.role.trim() || !form.dateApplied) {
      setFormError("Please fill in Company, Role and Date Applied before saving.");
      return;
    }
    setFormError("");
    const isEdit = editId !== null;
    const updated = isEdit
      ? apps.map(a => a.id === editId ? { ...form, id: a.id, autoGhosted: false } : a)
      : [{ ...form, id: nextId(), autoGhosted: false }, ...apps];
    setApps(updated);
    setForm(EMPTY_FORM);
    setModalOpen(false);
    setEditId(null);
    showToast(isEdit ? "Application updated!" : "Application added!");
    persistToStorage(updated);
  };

  const openEdit = (id) => {
    const a = appById(id);
    if (!a) return;
    setForm({
      ...EMPTY_FORM, ...a,
      hmAvailable: a.hmAvailable !== false && a.hiringManager !== "Not Available",
      hmLinkedInAvailable: a.hmLinkedInAvailable !== false,
    });
    setEditId(id);
    setModalOpen(true);
  };

  const openNewApplication = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setFormError("");
    setModalOpen(true);
  };

  const handleDelete = (id) => {
    const updated = apps.filter(a => a.id !== id);
    setApps(updated);
    setDeleteConfirmId(null);
    if (detailId === id) setDetailId(null);
    if (editId === id) setEditId(null);
    showToast("Application removed.");
    persistToStorage(updated);
  };
  const handleStatusChange = (id, status) => {
    const updated = apps.map(a => a.id === id ? { ...a, status, autoGhosted: false } : a);
    setApps(updated);
    showToast(`Moved to ${status}`);
    persistToStorage(updated);
  };
  const handleFollowUpStatus = (id, followUpStatus) => {
    const updated = apps.map(a => a.id === id ? { ...a, followUpStatus } : a);
    setApps(updated);
    showToast(FOLLOWUP_STATUS[followUpStatus]?.label + " recorded!");
    persistToStorage(updated);
  };

  // Export data as downloadable JSON file
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(exportPayload(apps), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-tracker-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${apps.length} applications`);
  };

  // Import data from JSON file
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = decodeStoredApps(text);
        if (!imported?.apps || !Array.isArray(imported.apps)) {
          showToast("Invalid file — could not parse applications.", "error");
          return;
        }
        const withIds = autoGhost(ensureIds(imported.apps));
        // Merge: keep existing apps, add imported ones that don't already exist (by id)
        const existingIds = new Set(apps.map(a => a.id));
        const newApps = withIds.filter(a => !existingIds.has(a.id));
        if (newApps.length === 0) {
          // No new IDs — user might be restoring from backup, replace all
          const confirmed = window.confirm(
            `Replace all ${apps.length} current applications with ${withIds.length} from backup?`
          );
          if (!confirmed) return;
          setApps(withIds);
          persistToStorage(withIds);
          showToast(`Restored ${withIds.length} applications from backup`);
        } else {
          const merged = [...newApps, ...apps];
          setApps(merged);
          persistToStorage(merged);
          showToast(`Imported ${newApps.length} new applications (${apps.length} existing kept)`);
        }
        if (imported.recovered) {
          setStorageHealth("warn");
          setStorageMessage("Imported a partially recovered backup.");
          showToast("Backup was partially recovered during import.", "error");
        }
      } catch (_) {
        showToast("Failed to read file.", "error");
      }
    };
    input.click();
  };

  const today = new Date().toISOString().split("T")[0];
  const dueFollowUps = apps.filter(a => a.followUpDate && a.followUpDate <= today && !["Rejected","Withdrawn","Offer","Ghosted"].includes(a.status) && !a.followUpStatus);
  const daysUntilGhost = (app) => { if (!["Applied","Follow-Up"].includes(app.status)) return null; const r = GHOST_DAYS - daysSince(app.dateApplied); return r > 0 ? r : 0; };

  const sorted = [...apps].sort((a, b) => {
    if (sortBy === "date") return (b.dateApplied || "").localeCompare(a.dateApplied || "");
    if (sortBy === "company") return a.company.localeCompare(b.company);
    if (sortBy === "status") return a.status.localeCompare(b.status);
    return 0;
  });

  const filtered = sorted.filter(a => (filterStatus === "All" || a.status === filterStatus) && (!search || a.company.toLowerCase().includes(search.toLowerCase()) || a.role.toLowerCase().includes(search.toLowerCase())));

  const statusCounts = Object.keys(STATUS_CONFIG).map(s => ({ name: s, value: apps.filter(a => a.status === s).length, color: STATUS_CONFIG[s].color })).filter(d => d.value > 0);
  const byMonth = apps.reduce((acc, a) => { const m = a.dateApplied?.slice(0,7) || "Unknown"; acc[m] = (acc[m]||0)+1; return acc; }, {});
  const monthData = Object.entries(byMonth).sort().map(([m,c]) => ({ month: m.slice(5)+"/"+m.slice(2,4), count: c }));
  const last7 = Array.from({length:7},(_,i) => { const d=new Date(); d.setDate(d.getDate()-(6-i)); const ds=d.toISOString().split("T")[0]; const wknd=isWeekend(d); return { day: d.toLocaleDateString("en-GB",{weekday:"short"}), count: apps.filter(a=>a.dateApplied===ds).length, weekend: wknd }; });
  const todayCount = apps.filter(a => a.dateApplied === today).length;
  const todayIsWeekend = isTodayWeekend();
  const responseRate = apps.length > 0 ? Math.round((apps.filter(a=>!["Applied","Ghosted"].includes(a.status)).length/apps.length)*100) : 0;
  const interviewRate = apps.length > 0 ? Math.round((apps.filter(a=>["Interview","Offer"].includes(a.status)).length/apps.length)*100) : 0;
  const offerRate = apps.length > 0 ? Math.round((apps.filter(a=>a.status==="Offer").length/apps.length)*100) : 0;
  const ghostRate = apps.length > 0 ? Math.round((apps.filter(a=>a.status==="Ghosted").length/apps.length)*100) : 0;
  const activeApplications = apps.filter(a => !["Rejected","Ghosted","Withdrawn"].includes(a.status)).length;
  const recentApps = sorted.slice(0, 5);
  const interviewQueue = sorted.filter(a => a.status === "Interview" || a.status === "Offer" || a.interviewStage).slice(0, 6);
  const atRiskApps = sorted.filter(a => {
    const remaining = daysUntilGhost(a);
    return remaining !== null && remaining > 0 && remaining <= 7;
  }).slice(0, 6);
  const freshThisWeek = apps.filter(a => daysSince(a.dateApplied) <= 7).length;
  const appliedToday = apps.filter(a => a.dateApplied === today).length;
  const activeTabMeta = TABS.find(tab => tab.id === activeTab) || TABS[0];
  const roleFocus = Object.entries(apps.reduce((acc, app) => {
    const role = app.role?.trim();
    if (!role) return acc;
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const locationFocus = Object.entries(apps.reduce((acc, app) => {
    const location = app.location?.trim();
    if (!location) return acc;
    acc[location] = (acc[location] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const latestApplications = sorted.filter(a => a.dateApplied).slice(0, 3);
  const homeInsight = dueFollowUps.length > 0
    ? `You have ${dueFollowUps.length} follow-up${dueFollowUps.length !== 1 ? "s" : ""} due. The fastest win is to clear those first.`
    : interviewQueue.length > 0
      ? `You have ${interviewQueue.length} active interview or late-stage application${interviewQueue.length !== 1 ? "s" : ""} in play.`
      : `You have ${activeApplications} active application${activeApplications !== 1 ? "s" : ""} in motion. Keep the pipeline current at a pace that works for you.`;
  const todayBannerTone = todayIsWeekend
    ? { background: "#F3F4F6", border: "#E5E7EB", text: "#6B7280", badgeBackground: "#FFFFFF", badgeColor: "#6B7280", badgeBorder: "#E5E7EB" }
    : todayCount > 0
      ? { background: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", badgeBackground: "#DBEAFE", badgeColor: "#1D4ED8", badgeBorder: "#93C5FD" }
      : { background: "#F8FAFC", border: "#E2E8F0", text: "#475569", badgeBackground: "#FFFFFF", badgeColor: "#64748B", badgeBorder: "#CBD5E1" };
  const todayBannerMessage = todayIsWeekend
    ? (todayCount > 0
      ? `Weekend check-in: ${todayCount} application${todayCount !== 1 ? "s" : ""} logged today.`
      : "Weekend check-in. No pressure to log applications today.")
    : (todayCount > 0
      ? `You've logged ${todayCount} application${todayCount !== 1 ? "s" : ""} today.`
      : "No applications logged today yet. Use the tracker when you're ready.");
  const todayBannerHelper = dueFollowUps.length > 0
    ? `${dueFollowUps.length} follow-up${dueFollowUps.length !== 1 ? "s" : ""} still need attention.`
    : "A quick update here keeps your pipeline accurate.";
  const todaySummaryValue = todayIsWeekend
    ? (todayCount > 0 ? `${todayCount} logged` : "Weekend")
    : (todayCount > 0 ? `${todayCount} logged` : "No activity");
  const todaySummaryColor = todayIsWeekend ? "#9CA3AF" : todayCount > 0 ? "#3B82F6" : "#64748B";
  const todaySummaryEmoji = todayIsWeekend ? "🛋️" : "📆";
  const detailApp = detailId !== null ? appById(detailId) : null;
  const deleteApp = deleteConfirmId !== null ? appById(deleteConfirmId) : null;

  if (loading) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F0F4F8"}}><p style={{color:"#6B7280",fontSize:15,fontFamily:"Georgia,serif"}}>Loading your tracker…</p></div>;

  return (
    <div style={{ minHeight: "100vh", background: "#F0F4F8", fontFamily: "'Segoe UI', Georgia, sans-serif" }}>

      <div style={{ background: "linear-gradient(135deg, #1F4E79 0%, #1a3a5c 100%)", padding: "22px 28px 0", boxShadow: "0 4px 24px rgba(31,78,121,0.4)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingBottom: 18 }}>
            <div>
              <h1 style={{ margin: 0, color: "#fff", fontSize: 24, fontFamily: "Georgia, serif", fontWeight: 700 }}>📋 Adil's Job Tracker</h1>
              <p style={{ margin: "4px 0 0", color: "#93C5FD", fontSize: 12 }}>{apps.length} total · {todayCount} today · {dueFollowUps.length} follow-up{dueFollowUps.length!==1?"s":""} due</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {onLogout && (
                <button
                  onClick={onLogout}
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 999,
                    padding: "8px 14px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                  title="End your current session"
                >
                  Lock App
                </button>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: storageHealth === "error"
                    ? "rgba(239,68,68,0.25)"
                    : storageHealth === "warn"
                      ? "rgba(245,158,11,0.25)"
                      : "rgba(16,185,129,0.2)",
                  borderRadius: 20,
                  padding: "5px 12px",
                  cursor: "pointer",
                }}
                onClick={handleExport}
                title={`${storageBackend} · ${storageMessage}. Click to export backup.`}
              >
                <span style={{ fontSize: 13 }}>{storageHealth === "error" ? "⚠️" : storageHealth === "warn" ? "💾" : "🟢"}</span>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 11 }}>
                  {storageBackend} · {storageMessage}
                </span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={handleExport} title="Export backup" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 13 }}>📥</button>
                <button onClick={handleImport} title="Import backup" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 13 }}>📤</button>
              </div>
              <button onClick={openNewApplication} style={{ background: "#3B82F6", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 14px rgba(59,130,246,0.45)" }}>+ New Application</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "10px 16px",
                  background: activeTab === tab.id ? "#fff" : "rgba(255,255,255,0.08)",
                  color: activeTab === tab.id ? "#1F4E79" : "rgba(255,255,255,0.78)",
                  border: "none",
                  borderRadius: "12px 12px 0 0",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
                title={tab.description}
              >
                {tab.emoji} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(260px, 0.8fr)", gap: 14, marginBottom: 16 }}>
          <SectionCard
            title={`${activeTabMeta.emoji} ${activeTabMeta.label}`}
            subtitle={activeTabMeta.description}
            style={{ background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)" }}
          >
            <p style={{ margin: 0, color: "#475569", fontSize: 13, lineHeight: 1.7 }}>
              {homeInsight}
            </p>
          </SectionCard>
          <SectionCard title="Today" subtitle="Quick pulse on the search">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "Applied", value: appliedToday, color: "#3B82F6" },
                { label: "Due", value: dueFollowUps.length, color: "#F59E0B" },
                { label: "Interviews", value: interviewQueue.length, color: "#8B5CF6" },
              ].map((item) => (
                <div key={item.label} style={{ background: "#F8FAFC", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: item.color, fontFamily: "Georgia,serif" }}>{item.value}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.06em" }}>{item.label.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {ghostedBanner.length > 0 && (
          <div style={{ background: "#F9FAFB", border: "1.5px solid #E5E7EB", borderRadius: 12, padding: "12px 18px", marginBottom: 14 }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#6B7280", fontSize: 13 }}>👻 {ghostedBanner.length} application{ghostedBanner.length>1?"s have":" has"} been auto-marked as Ghosted (no response after {GHOST_DAYS} days):</p>
            {ghostedBanner.map((a,i) => <p key={a.id || i} style={{ margin:"3px 0 0", color:"#9CA3AF", fontSize:12 }}>→ <strong>{a.company}</strong> — {a.role} (applied {a.dateApplied})</p>)}
            <button onClick={() => setGhostedBanner([])} style={{ marginTop:8, fontSize:11, color:"#9CA3AF", background:"none", border:"none", cursor:"pointer", padding:0 }}>Dismiss</button>
          </div>
        )}

        {dueFollowUps.filter(a => !dismissedFollowUps.has(a.id)).length > 0 && activeTab !== "Pipeline" && (
          <div style={{ background: "#FFFBEB", border: "1.5px solid #FDE68A", borderRadius: 12, padding: "12px 18px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#92400E", fontSize: 13 }}>
              🔔 {dueFollowUps.filter(a => !dismissedFollowUps.has(a.id)).length} follow-up{dueFollowUps.filter(a => !dismissedFollowUps.has(a.id)).length > 1 ? "s are" : " is"} due.
            </p>
            <button onClick={() => setActiveTab("Pipeline")} style={{ padding: "8px 14px", background: "#fff", color: "#92400E", border: "1.5px solid #FDE68A", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              Open Pipeline
            </button>
          </div>
        )}

        <div style={{
          background: todayBannerTone.background,
          border: `1.5px solid ${todayBannerTone.border}`,
          borderRadius:12, padding:"12px 18px", marginBottom:18,
          display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12
        }}>
          <div>
            <p style={{ margin:0, fontWeight:700, color:todayBannerTone.text, fontSize:13 }}>
              {todayIsWeekend ? "🛋️ " : "📆 "}{todayBannerMessage}
            </p>
            <p style={{ margin:"4px 0 0", color:"#64748B", fontSize:12 }}>
              {todayBannerHelper}
            </p>
          </div>
          <div style={{
            padding:"7px 12px",
            borderRadius:999,
            background: todayBannerTone.badgeBackground,
            border: `1px solid ${todayBannerTone.badgeBorder}`,
            color: todayBannerTone.badgeColor,
            fontSize:12,
            fontWeight:700,
            whiteSpace:"nowrap",
          }}>
            {todayCount} logged today
          </div>
        </div>

        {activeTab === "Home" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:12, marginBottom:16 }}>
              {[
                { label: "Active Search", value: activeApplications, color: "#1F4E79", note: "roles still in play" },
                { label: "This Week", value: freshThisWeek, color: "#3B82F6", note: "applications added" },
                { label: "Follow-Ups Due", value: dueFollowUps.length, color: "#F59E0B", note: "priority actions" },
                { label: "Interview Queue", value: interviewQueue.length, color: "#8B5CF6", note: "late-stage roles" },
              ].map((card) => (
                <SectionCard key={card.label} style={{ padding: "16px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase" }}>{card.label}</div>
                  <div style={{ marginTop: 6, fontSize: 30, fontWeight: 800, color: card.color, fontFamily: "Georgia,serif" }}>{card.value}</div>
                  <div style={{ marginTop: 4, color: "#64748B", fontSize: 12 }}>{card.note}</div>
                </SectionCard>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:14, marginBottom:16 }}>
              <SectionCard
                title="Welcome Back"
                subtitle="A quick read on where your search stands right now."
                actions={<button onClick={openNewApplication} style={{ padding:"8px 14px", background:"#EFF6FF", color:"#1F4E79", border:"1.5px solid #BFDBFE", borderRadius:9, cursor:"pointer", fontSize:12, fontWeight:700 }}>Add Application</button>}
              >
                <div style={{ display:"grid", gap:10 }}>
                  {[
                    dueFollowUps.length > 0 ? `Clear ${dueFollowUps.length} overdue follow-up${dueFollowUps.length !== 1 ? "s" : ""} to keep momentum.` : "No overdue follow-ups right now.",
                    atRiskApps.length > 0 ? `${atRiskApps.length} application${atRiskApps.length !== 1 ? "s" : ""} are close to ghosting. Consider nudging the strongest ones.` : "No immediate ghost-risk applications this week.",
                    responseRate > 0 ? `Your current response rate is ${responseRate}%. Keep targeting similar roles and companies.` : "You are still early in the cycle. Keep the tracker current and focus on the roles that fit best.",
                  ].map((item) => (
                    <div key={item} style={{ background:"#F8FAFC", borderRadius:12, padding:"10px 12px", color:"#475569", fontSize:13, lineHeight:1.6 }}>
                      {item}
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Search Focus" subtitle="Patterns from your current applications.">
                <div style={{ display:"grid", gap:12 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:"#94A3B8", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Top Roles</div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {roleFocus.length > 0 ? roleFocus.map(([role, count]) => (
                        <span key={role} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:999, background:"#EFF6FF", border:"1px solid #BFDBFE", color:"#1F4E79", fontSize:12, fontWeight:700 }}>
                          {role} <span style={{ color:"#64748B" }}>{count}</span>
                        </span>
                      )) : <span style={{ color:"#94A3B8", fontSize:12 }}>No role pattern yet.</span>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:"#94A3B8", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Top Locations</div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {locationFocus.length > 0 ? locationFocus.map(([location, count]) => (
                        <span key={location} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:999, background:"#F8FAFC", border:"1px solid #E2E8F0", color:"#334155", fontSize:12, fontWeight:700 }}>
                          {location} <span style={{ color:"#64748B" }}>{count}</span>
                        </span>
                      )) : <span style={{ color:"#94A3B8", fontSize:12 }}>No location pattern yet.</span>}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:14 }}>
              <SectionCard
                title="Latest Applications"
                subtitle="Your newest entries and their current status."
                actions={<button onClick={() => setActiveTab("Job Search")} style={{ padding:"8px 14px", background:"#EFF6FF", color:"#1F4E79", border:"1.5px solid #BFDBFE", borderRadius:9, cursor:"pointer", fontSize:12, fontWeight:700 }}>Open Job Search</button>}
              >
                {latestApplications.length > 0 ? latestApplications.map((app) => (
                  <div key={app.id} style={{ padding:"12px 0", borderTop:"1px solid #F1F5F9" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                      <div>
                        <div style={{ fontWeight:700, color:"#111827", fontSize:14 }}>{app.company}</div>
                        <div style={{ color:"#64748B", fontSize:12 }}>{app.role} · {app.dateApplied}</div>
                      </div>
                      <Badge status={app.status} />
                    </div>
                  </div>
                )) : <p style={{ margin:0, color:"#94A3B8", fontSize:13 }}>No applications yet.</p>}
              </SectionCard>

              <SectionCard
                title="Next Best Actions"
                subtitle="Use these shortcuts to keep the workflow moving."
              >
                <div style={{ display:"grid", gap:10 }}>
                  {[
                    { label: "Review follow-ups", helper: `${dueFollowUps.length} due right now`, action: () => setActiveTab("Pipeline") },
                    { label: "Update search list", helper: `${filtered.length} visible application${filtered.length !== 1 ? "s" : ""}`, action: () => setActiveTab("Job Search") },
                    { label: "Check performance", helper: `${responseRate}% response rate`, action: () => setActiveTab("Analytics") },
                  ].map((item) => (
                    <button key={item.label} onClick={item.action} style={{ textAlign:"left", padding:"12px 14px", borderRadius:12, border:"1.5px solid #E2E8F0", background:"#F8FAFC", cursor:"pointer" }}>
                      <div style={{ fontWeight:700, color:"#0F172A", fontSize:13 }}>{item.label}</div>
                      <div style={{ marginTop:4, color:"#64748B", fontSize:12 }}>{item.helper}</div>
                    </button>
                  ))}
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {activeTab === "Job Search" && (
          <>
            <SectionCard
              title="Job Search Workspace"
              subtitle="Manage the active search list, keep statuses current, and add fresh leads."
              style={{ marginBottom: 16 }}
            >
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(85px, 1fr))", gap:8 }}>
                {[{label:"All",count:apps.length,color:"#1F4E79"}, ...Object.keys(STATUS_CONFIG).map(s=>({label:s,count:apps.filter(a=>a.status===s).length,color:STATUS_CONFIG[s].color}))].map(s=>(
                  <div key={s.label} onClick={()=>setFilterStatus(s.label)} style={{ background:"#fff", borderRadius:11, padding:"10px 6px", textAlign:"center", border:`2px solid ${filterStatus===s.label?s.color:"#E5E7EB"}`, cursor:"pointer", boxShadow:filterStatus===s.label?`0 0 0 3px ${s.color}22`:"0 1px 3px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize:18, fontWeight:800, color:s.color, fontFamily:"Georgia,serif" }}>{s.count}</div>
                    <div style={{ fontSize:9, fontWeight:700, color:"#9CA3AF", letterSpacing:"0.03em" }}>{s.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <input placeholder="🔍 Search company or role…" value={search} onChange={e=>setSearch(e.target.value)} style={{ flex:1, minWidth:180, padding:"9px 14px", border:"1.5px solid #E5E7EB", borderRadius:9, fontSize:13, background:"#fff", outline:"none", fontFamily:"inherit" }}/>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{ padding:"9px 12px", border:"1.5px solid #E5E7EB", borderRadius:9, fontSize:13, background:"#fff", outline:"none", fontFamily:"inherit", cursor:"pointer" }}>
                <option value="date">Sort: Date</option>
                <option value="company">Sort: Company</option>
                <option value="status">Sort: Status</option>
              </select>
            </div>

            {filtered.length===0 ? (
              <div style={{ background:"#fff", borderRadius:14, padding:"48px 24px", textAlign:"center", border:"1.5px dashed #E5E7EB" }}>
                <p style={{ fontSize:36, margin:"0 0 8px" }}>📭</p>
                <p style={{ color:"#9CA3AF", fontSize:14, margin:0 }}>{apps.length===0?"No applications yet — add your first one!":"No results match your filter."}</p>
              </div>
            ) : filtered.map(app => {
              const isOverdue = app.followUpDate && app.followUpDate<=today && !["Rejected","Withdrawn","Offer","Ghosted"].includes(app.status);
              const dLeft = daysUntilGhost(app);
              const warningSoon = dLeft!==null && dLeft<=5 && dLeft>0;
              return (
                <div key={app.id} onClick={()=>setDetailId(app.id)} style={{ background:"#fff", borderRadius:13, padding:"14px 18px", marginBottom:9, border:`1.5px solid ${isOverdue?"#FDE68A":warningSoon?"#FED7AA":"#E5E7EB"}`, boxShadow:"0 1px 4px rgba(0,0,0,0.05)", cursor:"pointer", transition:"box-shadow 0.15s" }}
                  onMouseOver={e=>e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.1)"} onMouseOut={e=>e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.05)"}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <span style={{ fontWeight:700, fontSize:15, color:"#111827", fontFamily:"Georgia,serif" }}>{app.company}</span>
                        <Badge status={app.status}/>
                        {app.interviewStage&&<span style={{ fontSize:11, color:"#8B5CF6", fontWeight:600, background:"#F5F3FF", padding:"2px 8px", borderRadius:10, border:"1px solid #DDD6FE" }}>{app.interviewStage}</span>}
                        {isOverdue&&<span style={{ fontSize:10, color:"#F59E0B", fontWeight:700 }}>🔔 FOLLOW-UP DUE</span>}
                        {isOverdue && app.followUpStatus && (() => { const fs=FOLLOWUP_STATUS[app.followUpStatus]; return <span style={{ fontSize:10, fontWeight:700, color:fs.color, background:fs.bg, border:`1px solid ${fs.border}`, padding:"1px 7px", borderRadius:10 }}>{fs.emoji} {fs.label}</span>; })()}
                        {warningSoon&&<span style={{ fontSize:10, color:"#EA580C", fontWeight:700 }}>⏳ {dLeft}d to ghost</span>}
                        {app.autoGhosted&&<span style={{ fontSize:10, color:"#9CA3AF", fontWeight:600 }}>auto-ghosted</span>}
                      </div>
                      <p style={{ margin:"3px 0 0", fontSize:12, color:"#6B7280" }}>{app.role}{app.location?` · ${app.location}`:""} · Applied {app.dateApplied}{app.hiringManager?` · ${app.hiringManager}`:""}</p>
                    </div>
                    <div style={{ display:"flex", gap:6 }} onClick={e=>e.stopPropagation()}>
                      <select value={app.status} onChange={e=>handleStatusChange(app.id,e.target.value)} style={{ padding:"5px 8px", border:"1.5px solid #E5E7EB", borderRadius:7, fontSize:11, cursor:"pointer", fontFamily:"inherit", background:"#F9FAFB" }}>
                        {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                      <button onClick={()=>openEdit(app.id)} style={{ padding:"5px 11px", background:"#EFF6FF", color:"#1F4E79", border:"1.5px solid #BFDBFE", borderRadius:7, cursor:"pointer", fontSize:11, fontWeight:700 }}>Edit</button>
                      <button onClick={()=>setDeleteConfirmId(app.id)} style={{ padding:"5px 11px", background:"#FEF2F2", color:"#EF4444", border:"1.5px solid #FECACA", borderRadius:7, cursor:"pointer", fontSize:11, fontWeight:700 }}>✕</button>
                    </div>
                  </div>
                  {app.notes&&<p style={{ margin:"7px 0 0", fontSize:11, color:"#9CA3AF", fontStyle:"italic", borderTop:"1px solid #F3F4F6", paddingTop:6 }}>📝 {app.notes}</p>}
                </div>
              );
            })}
          </>
        )}

        {activeTab === "Pipeline" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:14, marginBottom:14 }}>
              <SectionCard title="Follow-Ups" subtitle="Clear the overdue queue first.">
                {dueFollowUps.filter(a => !dismissedFollowUps.has(a.id)).length > 0 ? dueFollowUps.filter(a => !dismissedFollowUps.has(a.id)).map((a) => {
                  const fs = FOLLOWUP_STATUS[a.followUpStatus || ""];
                  const hasAnswered = !!a.followUpStatus;
                  return (
                    <div key={a.id} style={{ background: "#fff", border: `1.5px solid ${fs.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{a.company}</span>
                          <span style={{ fontSize: 12, color: "#6B7280" }}>— {a.role} · due {a.followUpDate}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: fs.color, background: fs.bg, border: `1px solid ${fs.border}`, padding: "1px 8px", borderRadius: 10 }}>{fs.emoji} {fs.label}</span>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                          {a.hmLinkedIn && (
                            <a href={a.hmLinkedIn} target="_blank" rel="noreferrer" style={{ padding: "4px 10px", background: "#EFF6FF", color: "#1F4E79", border: "1.5px solid #BFDBFE", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>LinkedIn ↗</a>
                          )}
                          <button onClick={() => handleFollowUpStatus(a.id, "messaged")} style={{ padding: "4px 10px", background: a.followUpStatus==="messaged"?"#10B981":"#ECFDF5", color: a.followUpStatus==="messaged"?"#fff":"#065F46", border: "1.5px solid #A7F3D0", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✅ Messaged</button>
                          <button onClick={() => handleFollowUpStatus(a.id, "premium")} style={{ padding: "4px 10px", background: a.followUpStatus==="premium"?"#8B5CF6":"#F5F3FF", color: a.followUpStatus==="premium"?"#fff":"#5B21B6", border: "1.5px solid #DDD6FE", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>🔒 Premium</button>
                          <button onClick={() => handleFollowUpStatus(a.id, "email_instead")} style={{ padding: "4px 10px", background: a.followUpStatus==="email_instead"?"#3B82F6":"#EFF6FF", color: a.followUpStatus==="email_instead"?"#fff":"#1e40af", border: "1.5px solid #BFDBFE", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>📧 Emailed</button>
                          <button onClick={() => handleFollowUpStatus(a.id, "no_linkedin")} style={{ padding: "4px 10px", background: a.followUpStatus==="no_linkedin"?"#6B7280":"#F3F4F6", color: a.followUpStatus==="no_linkedin"?"#fff":"#374151", border: "1.5px solid #D1D5DB", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>🚫 No LinkedIn</button>
                          {hasAnswered && (
                            <button onClick={() => setDismissedFollowUps(prev => new Set([...prev, a.id]))}
                              style={{ padding: "4px 10px", background: "#FEF2F2", color: "#EF4444", border: "1.5px solid #FECACA", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, marginLeft: 4 }}>
                              ✕ Clear
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }) : <p style={{ margin:0, color:"#94A3B8", fontSize:13 }}>No overdue follow-ups. Good.</p>}
              </SectionCard>

              <SectionCard title="Interview & Offer Queue" subtitle="Roles that need close attention.">
                {interviewQueue.length > 0 ? interviewQueue.map((app) => (
                  <div key={app.id} style={{ padding:"10px 0", borderTop:"1px solid #F1F5F9", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                    <div>
                      <div style={{ fontWeight:700, color:"#111827", fontSize:13 }}>{app.company}</div>
                      <div style={{ color:"#64748B", fontSize:12 }}>{app.role}{app.interviewStage ? ` · ${app.interviewStage}` : ""}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      <Badge status={app.status} />
                      <button onClick={() => setDetailId(app.id)} style={{ padding:"5px 10px", background:"#EFF6FF", color:"#1F4E79", border:"1.5px solid #BFDBFE", borderRadius:8, cursor:"pointer", fontSize:11, fontWeight:700 }}>Open</button>
                    </div>
                  </div>
                )) : <p style={{ margin:0, color:"#94A3B8", fontSize:13 }}>No interviews or offers in the queue yet.</p>}
              </SectionCard>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:14 }}>
              <SectionCard title="Ghost Risk" subtitle={`Applications likely to ghost within ${GHOST_DAYS} days if untouched.`}>
                {atRiskApps.length > 0 ? atRiskApps.map((app) => {
                  const dLeft = daysUntilGhost(app);
                  return (
                    <div key={app.id} style={{ padding:"10px 0", borderTop:"1px solid #F1F5F9", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                      <div>
                        <div style={{ fontWeight:700, color:"#111827", fontSize:13 }}>{app.company}</div>
                        <div style={{ color:"#64748B", fontSize:12 }}>{app.role} · {dLeft} day{dLeft !== 1 ? "s" : ""} left</div>
                      </div>
                      <button onClick={() => openEdit(app.id)} style={{ padding:"5px 10px", background:"#FFF7ED", color:"#C2410C", border:"1.5px solid #FED7AA", borderRadius:8, cursor:"pointer", fontSize:11, fontWeight:700 }}>Update</button>
                    </div>
                  );
                }) : <p style={{ margin:0, color:"#94A3B8", fontSize:13 }}>No ghost-risk applications this week.</p>}
              </SectionCard>

              <SectionCard title="Pipeline Notes" subtitle="Useful reminders for keeping the process disciplined.">
                <div style={{ display:"grid", gap:10 }}>
                  {[
                    "Prioritise overdue follow-ups before adding low-fit new applications.",
                    "Update interview stages immediately after each recruiter or hiring manager touchpoint.",
                    "Export a fresh backup after large edits or imports.",
                  ].map((tip) => (
                    <div key={tip} style={{ background:"#F8FAFC", borderRadius:12, padding:"11px 12px", color:"#475569", fontSize:13, lineHeight:1.6 }}>
                      {tip}
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {activeTab === "Analytics" && (
          <>
            {apps.length===0 ? (
              <div style={{ background:"#fff", borderRadius:14, padding:"60px 24px", textAlign:"center", border:"1.5px dashed #E5E7EB" }}>
                <p style={{ fontSize:40, margin:"0 0 10px" }}>📊</p>
                <p style={{ color:"#9CA3AF", fontSize:14 }}>Add applications to see your analytics.</p>
              </div>
            ) : (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))", gap:12, marginBottom:18 }}>
                  {[
                    {label:"Total Applied",value:apps.length,color:"#1F4E79",emoji:"📤"},
                    {label:"Response Rate",value:responseRate+"%",color:"#8B5CF6",emoji:"📬"},
                    {label:"Interview Rate",value:interviewRate+"%",color:"#3B82F6",emoji:"🗣️"},
                    {label:"Offer Rate",value:offerRate+"%",color:"#10B981",emoji:"🎉"},
                    {label:"Ghost Rate",value:ghostRate+"%",color:"#9CA3AF",emoji:"👻"},
                    {label:"Today",value:todaySummaryValue,color:todaySummaryColor,emoji:todaySummaryEmoji},
                  ].map(k=>(
                    <div key={k.label} style={{ background:"#fff", borderRadius:13, padding:"16px 12px", textAlign:"center", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", border:"1.5px solid #E5E7EB" }}>
                      <div style={{ fontSize:20 }}>{k.emoji}</div>
                      <div style={{ fontSize:22, fontWeight:800, color:k.color, fontFamily:"Georgia,serif", margin:"4px 0 2px" }}>{k.value}</div>
                      <div style={{ fontSize:9, fontWeight:700, color:"#9CA3AF", letterSpacing:"0.05em" }}>{k.label.toUpperCase()}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background:"#fff", borderRadius:14, padding:"18px 18px", marginBottom:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", border:"1.5px solid #E5E7EB" }}>
                  <h3 style={{ margin:"0 0 12px", color:"#1F4E79", fontSize:14, fontFamily:"Georgia,serif" }}>📆 Daily Activity — Last 7 Days</h3>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={last7} margin={{top:10,right:10,left:-20,bottom:0}}>
                      <XAxis dataKey="day" tick={{fontSize:11}}/>
                      <YAxis tick={{fontSize:11}} allowDecimals={false}/>
                      <Tooltip/>
                      <Bar dataKey="count" name="Applications logged" radius={[5,5,0,0]}>
                        {last7.map((e,i)=><Cell key={i} fill={e.weekend ? "#D1D5DB" : e.count >= 3 ? "#10B981" : e.count > 0 ? "#3B82F6" : "#E5E7EB"}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p style={{ margin:"6px 0 0", fontSize:11, color:"#9CA3AF", textAlign:"center" }}>🟢 Higher activity · 🔵 Activity logged · ⬜ No applications · ▪️ Weekend</p>
                </div>

                <div style={{ background:"#fff", borderRadius:14, padding:"18px 18px", marginBottom:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", border:"1.5px solid #E5E7EB" }}>
                  <h3 style={{ margin:"0 0 12px", color:"#1F4E79", fontSize:15, fontFamily:"Georgia,serif" }}>🔽 Application Funnel</h3>
                  <SankeyFunnel apps={apps}/>
                  <p style={{ margin:"8px 0 0", fontSize:11, color:"#9CA3AF", textAlign:"center" }}>Set "Interview Stage" on each application to populate the funnel accurately.</p>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:14, marginBottom:14 }}>
                  <div style={{ background:"#fff", borderRadius:14, padding:"16px 14px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", border:"1.5px solid #E5E7EB" }}>
                    <h3 style={{ margin:"0 0 10px", color:"#1F4E79", fontSize:13, fontFamily:"Georgia,serif" }}>🥧 Status Breakdown</h3>
                    <ResponsiveContainer width="100%" height={190}>
                      <PieChart>
                        <Pie data={statusCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} labelLine={false} label={({name,value})=>value>0?`${name} (${value})`:""}>
                          {statusCounts.map((e,i)=><Cell key={i} fill={e.color}/>)}
                        </Pie>
                        <Tooltip/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ background:"#fff", borderRadius:14, padding:"16px 14px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", border:"1.5px solid #E5E7EB" }}>
                    <h3 style={{ margin:"0 0 10px", color:"#1F4E79", fontSize:13, fontFamily:"Georgia,serif" }}>📅 Applications by Month</h3>
                    {monthData.length===0?<p style={{color:"#9CA3AF",fontSize:12,textAlign:"center",paddingTop:40}}>No date data yet.</p>:(
                      <ResponsiveContainer width="100%" height={190}>
                        <BarChart data={monthData} margin={{top:10,right:10,left:-20,bottom:0}}>
                          <XAxis dataKey="month" tick={{fontSize:10}}/>
                          <YAxis tick={{fontSize:10}} allowDecimals={false}/>
                          <Tooltip/>
                          <Bar dataKey="count" fill="#3B82F6" radius={[5,5,0,0]} name="Applications"/>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div style={{ background:"#fff", borderRadius:14, padding:"18px 18px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", border:"1.5px solid #E5E7EB" }}>
                  <h3 style={{ margin:"0 0 14px", color:"#1F4E79", fontSize:14, fontFamily:"Georgia,serif" }}>📊 Outcome Breakdown</h3>
                  {Object.keys(STATUS_CONFIG).map(s=>{
                    const count=apps.filter(a=>a.status===s).length;
                    const pct=apps.length>0?(count/apps.length)*100:0;
                    const cfg=STATUS_CONFIG[s];
                    return (
                      <div key={s} style={{marginBottom:10}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,marginBottom:4}}>
                          <span style={{color:"#374151"}}>{cfg.emoji} {s}</span>
                          <span style={{color:cfg.color}}>{count} ({Math.round(pct)}%)</span>
                        </div>
                        <div style={{background:"#F3F4F6",borderRadius:6,height:8,overflow:"hidden"}}>
                          <div style={{background:cfg.color,height:"100%",width:`${pct}%`,borderRadius:6,transition:"width 0.6s ease"}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === "Interview Prep" && (
          <Suspense fallback={<div style={{ textAlign: "center", padding: 40, color: "#6B7280" }}>Loading interview prep...</div>}>
            <InterviewPrep apps={apps} />
          </Suspense>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px 20px" }}>
        <div style={{ color: "#94A3B8", fontSize: 12, textAlign: "center" }}>
          Live build v{__APP_VERSION__} · updated {__BUILD_DATE__} · encrypted starter data, browser-first storage, GitHub Pages deployment
        </div>
      </div>

      <Modal open={modalOpen} onClose={()=>{setModalOpen(false);setEditId(null);setForm(EMPTY_FORM);setFormError("");}}>
        <div style={{padding:"22px 26px 12px",borderBottom:"1px solid #F3F4F6"}}>
          <h2 style={{margin:0,fontSize:18,color:"#1F4E79",fontFamily:"Georgia,serif"}}>{editId!==null?"✏️ Edit Application":"📤 New Application"}</h2>
        </div>
        <div style={{padding:"16px 26px 0"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
            <Field label="Company" value={form.company} onChange={f("company")} placeholder="e.g. Google" required/>
            <Field label="Role" value={form.role} onChange={f("role")} placeholder="e.g. Data Engineer" required/>
            <Field label="Location" value={form.location} onChange={f("location")} placeholder="London / Remote"/>
            <Field label="Date Applied" value={form.dateApplied} onChange={f("dateApplied")} type="date" required/>
            <Field label="Status" value={form.status} onChange={f("status")} as="select" options={Object.keys(STATUS_CONFIG)}/>
            <Field label="Interview Stage" value={form.interviewStage} onChange={f("interviewStage")} as="select" options={INTERVIEW_STAGES}/>
            <Field label="Job URL" value={form.jobUrl} onChange={f("jobUrl")} placeholder="https://..."/>
            <Field label="Follow-Up Date" value={form.followUpDate} onChange={f("followUpDate")} type="date"/>

            {/* Hiring Manager — inline availability dropdown */}
            <div style={{marginBottom:13}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:4,letterSpacing:"0.05em",textTransform:"uppercase"}}>Hiring Manager</label>
              <div style={{display:"flex",gap:6}}>
                <select value={form.hmAvailable?"available":"na"}
                  onChange={e=>{const avail=e.target.value==="available";setForm(p=>({...p,hmAvailable:avail,hiringManager:avail?(p.hiringManager==="Not Available"?"":p.hiringManager):"Not Available"}));}}
                  style={{padding:"9px 8px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:12,color:"#111827",outline:"none",fontFamily:"inherit",background:"#FAFAFA",cursor:"pointer",flexShrink:0}}>
                  <option value="available">Known</option>
                  <option value="na">N/A</option>
                </select>
                <input value={form.hmAvailable?form.hiringManager:""} onChange={e=>f("hiringManager")(e.target.value)}
                  placeholder={form.hmAvailable?"e.g. Sarah Jones":"Not available"}
                  disabled={!form.hmAvailable}
                  style={{flex:1,padding:"9px 12px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:13,color:form.hmAvailable?"#111827":"#9CA3AF",outline:"none",fontFamily:"inherit",background:form.hmAvailable?"#FAFAFA":"#F3F4F6",boxSizing:"border-box"}}
                  onFocus={e=>{if(form.hmAvailable)e.target.style.borderColor="#1F4E79";}} onBlur={e=>e.target.style.borderColor="#E5E7EB"}/>
              </div>
            </div>

            {/* HM LinkedIn — inline availability dropdown */}
            <div style={{marginBottom:13}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:4,letterSpacing:"0.05em",textTransform:"uppercase"}}>HM LinkedIn</label>
              <div style={{display:"flex",gap:6}}>
                <select value={form.hmLinkedInAvailable?"available":"na"}
                  onChange={e=>{const avail=e.target.value==="available";setForm(p=>({...p,hmLinkedInAvailable:avail,hmLinkedIn:avail?p.hmLinkedIn:""}));}}
                  style={{padding:"9px 8px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:12,color:"#111827",outline:"none",fontFamily:"inherit",background:"#FAFAFA",cursor:"pointer",flexShrink:0}}>
                  <option value="available">Available</option>
                  <option value="na">N/A</option>
                </select>
                <input value={form.hmLinkedInAvailable?form.hmLinkedIn:""} onChange={e=>f("hmLinkedIn")(e.target.value)}
                  placeholder={form.hmLinkedInAvailable?"https://linkedin.com/in/...":"Not available"}
                  disabled={!form.hmLinkedInAvailable}
                  style={{flex:1,padding:"9px 12px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:13,color:form.hmLinkedInAvailable?"#111827":"#9CA3AF",outline:"none",fontFamily:"inherit",background:form.hmLinkedInAvailable?"#FAFAFA":"#F3F4F6",boxSizing:"border-box"}}
                  onFocus={e=>{if(form.hmLinkedInAvailable)e.target.style.borderColor="#1F4E79";}} onBlur={e=>e.target.style.borderColor="#E5E7EB"}/>
              </div>
            </div>
          </div>
          <Field label="Notes" value={form.notes} onChange={f("notes")} as="textarea" placeholder="Interview feedback, key contacts, how you found the role…" rows={3}/>
          {formError && (
            <div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:8,padding:"9px 14px",marginTop:4,fontSize:13,color:"#EF4444",fontWeight:600}}>
              ⚠️ {formError}
            </div>
          )}
        </div>
        <div style={{padding:"12px 26px 20px",display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button type="button" onClick={()=>{setModalOpen(false);setEditId(null);setForm(EMPTY_FORM);setFormError("");}} style={{padding:"9px 20px",background:"#F3F4F6",color:"#374151",border:"none",borderRadius:9,cursor:"pointer",fontWeight:600,fontSize:13}}>Cancel</button>
          <button type="button" onClick={handleSubmit} style={{padding:"9px 24px",background:"#1F4E79",color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontWeight:700,fontSize:13,boxShadow:"0 4px 12px rgba(31,78,121,0.3)"}}>{editId!==null?"Save Changes":"Add Application"}</button>
        </div>
      </Modal>

      <Modal open={detailApp!==null} onClose={()=>setDetailId(null)}>
        {detailApp&&(()=>{
          const a=detailApp;
          const dLeft=daysUntilGhost(a);
          return (
            <>
              <div style={{padding:"20px 26px 12px",borderBottom:"1px solid #F3F4F6"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <h2 style={{margin:0,fontSize:18,color:"#1F4E79",fontFamily:"Georgia,serif"}}>{a.company}</h2>
                  <Badge status={a.status}/>
                  {a.interviewStage&&<span style={{fontSize:11,color:"#8B5CF6",fontWeight:600,background:"#F5F3FF",padding:"2px 8px",borderRadius:10,border:"1px solid #DDD6FE"}}>{a.interviewStage}</span>}
                </div>
                <p style={{margin:"4px 0 0",color:"#6B7280",fontSize:13}}>{a.role}{a.location?` · ${a.location}`:""}</p>
                {dLeft!==null&&dLeft<=7&&dLeft>0&&<p style={{margin:"6px 0 0",fontSize:12,color:"#EA580C",fontWeight:600}}>⏳ Auto-ghosted in {dLeft} day{dLeft!==1?"s":""} if no update</p>}
              </div>
              <div style={{padding:"16px 26px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 24px"}}>
                {[["Date Applied",a.dateApplied],["Follow-Up",a.followUpDate||"—"],["Hiring Manager",a.hiringManager||"—"],["Days Since Applied",daysSince(a.dateApplied)+" days"]].map(([l,v])=>(
                  <div key={l}>
                    <div style={{fontSize:10,fontWeight:700,color:"#9CA3AF",letterSpacing:"0.06em",marginBottom:2}}>{l.toUpperCase()}</div>
                    <div style={{fontSize:13,color:"#111827",fontWeight:600}}>{v}</div>
                  </div>
                ))}
                {a.jobUrl&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,fontWeight:700,color:"#9CA3AF",letterSpacing:"0.06em",marginBottom:2}}>JOB POSTING</div><a href={a.jobUrl} target="_blank" rel="noreferrer" style={{fontSize:13,color:"#1F4E79",fontWeight:600}}>Open ↗</a></div>}
                {a.hmLinkedIn&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,fontWeight:700,color:"#9CA3AF",letterSpacing:"0.06em",marginBottom:2}}>HM LINKEDIN</div><a href={a.hmLinkedIn} target="_blank" rel="noreferrer" style={{fontSize:13,color:"#1F4E79",fontWeight:600}}>Open LinkedIn ↗</a></div>}
                {a.followUpDate&&<div style={{gridColumn:"1/-1"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#9CA3AF",letterSpacing:"0.06em",marginBottom:6}}>FOLLOW-UP STATUS</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {Object.entries(FOLLOWUP_STATUS).filter(([k])=>k!=="").map(([k,fs])=>(
                      <button key={k} onClick={()=>handleFollowUpStatus(a.id,k)} style={{padding:"5px 12px",background:a.followUpStatus===k?fs.color:fs.bg,color:a.followUpStatus===k?"#fff":fs.color,border:`1.5px solid ${fs.border}`,borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700}}>
                        {fs.emoji} {fs.label}
                      </button>
                    ))}
                  </div>
                </div>}
                {a.notes&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,fontWeight:700,color:"#9CA3AF",letterSpacing:"0.06em",marginBottom:4}}>NOTES</div><div style={{fontSize:13,color:"#374151",lineHeight:1.6,background:"#F9FAFB",borderRadius:8,padding:"10px 12px"}}>{a.notes}</div></div>}
              </div>
              <div style={{padding:"8px 26px 20px",display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>{setDetailId(null);openEdit(a.id);}} style={{padding:"9px 20px",background:"#EFF6FF",color:"#1F4E79",border:"1.5px solid #BFDBFE",borderRadius:9,cursor:"pointer",fontWeight:700,fontSize:13}}>Edit</button>
                <button onClick={()=>setDetailId(null)} style={{padding:"9px 20px",background:"#1F4E79",color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontWeight:700,fontSize:13}}>Close</button>
              </div>
            </>
          );
        })()}
      </Modal>

      <Modal open={deleteApp!==null} onClose={()=>setDeleteConfirmId(null)}>
        <div style={{padding:26}}>
          <h3 style={{margin:"0 0 10px",fontFamily:"Georgia,serif",color:"#111827"}}>Remove Application?</h3>
          <p style={{margin:"0 0 20px",color:"#6B7280",fontSize:14}}>Permanently delete <strong>{deleteApp?.company}</strong>? This cannot be undone.</p>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={()=>setDeleteConfirmId(null)} style={{padding:"9px 20px",background:"#F3F4F6",color:"#374151",border:"none",borderRadius:9,cursor:"pointer",fontWeight:600,fontSize:13}}>Cancel</button>
            <button onClick={()=>{ if (deleteConfirmId !== null) handleDelete(deleteConfirmId); }} style={{padding:"9px 20px",background:"#EF4444",color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontWeight:700,fontSize:13}}>Delete</button>
          </div>
        </div>
      </Modal>

      {toast&&<div style={{position:"fixed",bottom:24,right:24,zIndex:100,background:toast.type==="error"?"#EF4444":"#1F4E79",color:"#fff",padding:"12px 20px",borderRadius:10,fontSize:13,fontWeight:600,boxShadow:"0 8px 24px rgba(0,0,0,0.2)",animation:"fadeIn 0.2s ease"}}>{toast.type==="error"?"⚠️ ":"✅ "}{toast.msg}</div>}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
