import { useState, useEffect, useId, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Home as HomeIcon,
  LogOut,
  Keyboard,
  Mail,
  Monitor as MonitorIcon,
  Moon,
  Plus,
  Route as RouteIcon,
  Search as SearchIcon,
  Sun,
  Target as TargetIcon,
  Upload,
  BarChart3 as BarChartIcon,
  X,
} from "lucide-react";
import { useTheme } from "./useTheme";
import { useDismissals } from "./useDismissals";
import { APPLICATION_SOURCES, CLOSED_STATUSES, EMPTY_FORM, SECURED_STATUS, UNKNOWN_ROLE, hasKnownRole, FOLLOWUP_METHODS, FOLLOWUP_STATUS, GHOST_DAYS, INTERVIEW_STAGES, STATUS_CONFIG } from "./constants";
import {
  STORAGE_KEY,
  createSaveQueue,
  decodeStoredApps,
  exportPayload,
  isQuotaError,
  migrateToIDB,
  safeStorageCandidates,
  storageSize,
  storeCorruptPayload,
} from "./storage";
import { applyStatusTransition, autoGhost, findNewlyGhosted, normalizeApplications } from "./utils/applicationLifecycle";
import { filterApplications, findDuplicates, needsAttention, sortApplications } from "./utils/applicationFilters";
import { buildTrackerMetrics, daysUntilGhost } from "./utils/applicationMetrics";
import { addDays, daysSince, formatDate, isWeekend, relativeDay, todayISO } from "./utils/dates";
import { toCSV } from "./utils/exportCsv";
import { dismissKey, dueBannerKey } from "./utils/dismissals";
import { buildTimeline } from "./utils/timeline";
import { employmentState, formatTenure, tenureDays, validateEmploymentDates } from "./utils/employment";
import { summarizeChanges, useGmailSync } from "./gmail/useGmailSync";
import GmailPanel from "./gmail/GmailPanel";
import PipelineView from "./features/pipeline/PipelineView";

const InterviewPrep = lazy(() => import("./InterviewPrep"));
const AnalyticsView = lazy(() => import("./features/analytics/AnalyticsView"));

const TABS = [
  { id: "Home", icon: HomeIcon, label: "Home", description: "Welcome, priorities, and search guidance" },
  { id: "Job Search", icon: SearchIcon, label: "Job Search", description: "Track applications and manage search activity" },
  { id: "Pipeline", icon: RouteIcon, label: "Pipeline", description: "Follow-ups, interviews, and ghost-risk items" },
  { id: "Analytics", icon: BarChartIcon, label: "Analytics", description: "Performance, outcomes, and momentum trends" },
  { id: "Interview Prep", icon: TargetIcon, label: "Interview Prep", description: "Stage-aware tips, rehearsed answers, and your evidence" },
];
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// One-line employment summary for a secured job, e.g. "Worked 1 yr 3 mo · finished 2026-01-31".
function employmentSummary(app, today = todayISO()) {
  const state = employmentState(app, today);
  if (state === "unknown") return "Start date not set";
  if (state === "upcoming") return `Starts ${app.startDate}`;
  const tenure = formatTenure(tenureDays(app, today));
  return state === "finished" ? `Worked ${tenure} · finished ${app.endDate}` : `${tenure} so far · started ${app.startDate}`;
}

// ---------------------------------------------------------------------------
// UI components
// ---------------------------------------------------------------------------

function Badge({ status, interviewStage }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Applied"];
  const showStage = interviewStage && interviewStage !== "" && ["Rejected", "Withdrawn", "Ghosted"].includes(status);
  return (
    <span className="status-badge" data-status={status}>
      <span aria-hidden="true">{cfg.emoji}</span> {status.toUpperCase()}{showStage ? ` · ${interviewStage.toUpperCase()}` : ""}
    </span>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Modal({ open, onClose, label, children }) {
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);

  // Remember what was focused before opening so we can hand focus back on close.
  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const first = panelRef.current?.querySelector(FOCUSABLE);
    (first || panelRef.current)?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (restoreFocusRef.current instanceof HTMLElement) restoreFocusRef.current.focus();
    };
  }, [open]);

  // Escape must work even when focus has fallen out of the panel (e.g. the
  // focused button became disabled), so it is caught at the document too.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onDocKeyDown = (event) => {
      if (event.key !== "Escape" || panelRef.current?.contains(event.target)) return;
      onCloseRef.current();
    };
    document.addEventListener("keydown", onDocKeyDown);
    return () => document.removeEventListener("keydown", onDocKeyDown);
  }, [open]);

  // Escape closes; Tab cycles within the dialog instead of escaping to the page.
  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = Array.from(panelRef.current?.querySelectorAll(FOCUSABLE) || []);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={e => e.stopPropagation()}
        className="modal-panel"
      >
        {children}
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, type = "text", placeholder, required, as, options, rows }) {
  // The generated id ties <label> to its control, which the previous markup
  // never did — the label was purely visual and announced nothing.
  const reactId = useId();
  const controlId = id || `field-${reactId}`;
  const common = {
    id: controlId,
    className: "field__control",
    value,
    onChange: e => onChange(e.target.value),
    required,
  };
  return (
    <div className="field">
      <label className="field__label" htmlFor={controlId}>
        {label}{required && <span className="field__required" aria-hidden="true"> *</span>}
      </label>
      {as === "select" ? (
        <select {...common}>
          {options.map(o => <option key={o} value={o}>{o || "— None —"}</option>)}
        </select>
      ) : as === "textarea" ? (
        <textarea {...common} placeholder={placeholder} rows={rows || 3} />
      ) : (
        <input {...common} type={type} placeholder={placeholder} />
      )}
    </div>
  );
}

function SectionCard({ title, subtitle, actions = null, children, className = "" }) {
  return (
    <section className={`section-card ${className}`.trim()}>
      {(title || subtitle || actions) && (
        <div className="section-card__header">
          <div>
            {title && <h3 className="section-card__title">{title}</h3>}
            {subtitle && <p className="section-card__subtitle">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
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
  const [filterSource, setFilterSource] = useState("All");
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const searchInputRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [sortBy, setSortBy] = useState("date");
  const [ghostedBanner, setGhostedBanner] = useState([]);
  const [storageHealth, setStorageHealth] = useState("ok"); // "ok" | "warn" | "error"
  const [storageBackend, setStorageBackend] = useState("IndexedDB");
  const [storageMessage, setStorageMessage] = useState("Ready");
  const [importPrompt, setImportPrompt] = useState(null);
  const [gmailOpen, setGmailOpen] = useState(false);
  // Captures start/finish dates when an application moves to Job Secured.
  const [securedPrompt, setSecuredPrompt] = useState(null);
  const { preference: themePreference, resolved: resolvedTheme, cycleTheme } = useTheme();

  // `action` renders an inline button in the toast (used for undoing a delete).
  const showToast = useCallback((msg, type = "success", action = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type, action });
    toastTimerRef.current = setTimeout(() => setToast(null), action ? 8000 : 4000);
  }, []);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

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

  // Gmail syncs are async, so they read and write through a ref rather than
  // closing over a possibly stale `apps`.
  const appsRef = useRef(apps);
  appsRef.current = apps;
  const getApps = useCallback(() => appsRef.current, []);
  const commitApps = useCallback((next) => {
    appsRef.current = next;
    setApps(next);
    persistToStorage(next);
  }, [persistToStorage]);
  const handleGmailResult = useCallback(({ changes, before, scanned, error, interactive }) => {
    if (error) {
      showToast(error, "error");
      return;
    }
    if (changes.length === 0) {
      if (interactive) showToast(`Gmail checked (${scanned} email${scanned !== 1 ? "s" : ""}): no new updates.`);
      return;
    }
    const undo = () => {
      commitApps(before);
      showToast("Gmail changes undone.");
    };
    showToast(`Gmail: ${summarizeChanges(changes)}.`, "success", { label: "Undo", run: undo });
  }, [commitApps, showToast]);
  const gmail = useGmailSync({ getApps, commitApps, onResult: handleGmailResult });

  // Load on mount — with migration, recovery, and validation
  useEffect(() => {
    const fallback = setTimeout(() => setLoading(false), 5000);
    (async () => {
      try {
        await migrateToIDB();
        const seededApps = autoGhost(normalizeApplications(ensureIds(initialApps)));
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
          const withIds = normalizeApplications(ensureIds(resolved.decoded.apps));
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
    if (form.status === SECURED_STATUS) {
      const employmentError = validateEmploymentDates(form);
      if (employmentError) {
        setFormError(employmentError);
        return;
      }
    }
    setFormError("");
    const isEdit = editId !== null;
    const now = todayISO();
    const updated = isEdit
      ? apps.map(a => {
        if (a.id !== editId) return a;
        const merged = normalizeApplications([{ ...a, ...form, id: a.id, autoGhosted: false, updatedAt: now }], now)[0];
        return a.status !== form.status ? applyStatusTransition({ ...merged, status: a.status }, form.status, now) : merged;
      })
      : [normalizeApplications([{ ...form, id: nextId(), autoGhosted: false, createdAt: form.dateApplied || now, updatedAt: now, statusUpdatedAt: now }], now)[0], ...apps];
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
    // Most applications are logged the day they're sent, and a follow-up a
    // week later is the usual next step, so start from those.
    setForm({ ...EMPTY_FORM, dateApplied: todayISO(), followUpDate: addDays(todayISO(), 7) });
    setEditId(null);
    setFormError("");
    setModalOpen(true);
  };

  const handleDelete = (id) => {
    const removed = appById(id);
    const removedIndex = apps.findIndex(a => a.id === id);
    const updated = apps.filter(a => a.id !== id);
    setApps(updated);
    setDeleteConfirmId(null);
    if (detailId === id) setDetailId(null);
    if (editId === id) setEditId(null);
    persistToStorage(updated);

    // Restore at its original position so the list order survives an undo.
    const undo = () => {
      const restored = [...updated];
      restored.splice(Math.max(0, removedIndex), 0, removed);
      setApps(restored);
      persistToStorage(restored);
      showToast(`Restored ${removed.company}`);
    };
    showToast(`Removed ${removed?.company || "application"}.`, "success", removed ? { label: "Undo", run: undo } : null);
  };
  const openSecuredPrompt = (id) => {
    const a = appById(id);
    if (!a) return;
    setSecuredPrompt({ id, startDate: a.startDate || todayISO(), endDate: a.endDate || "", stillWorking: !a.endDate, error: "" });
  };
  const confirmSecured = () => {
    if (!securedPrompt) return;
    const { id, startDate, stillWorking } = securedPrompt;
    const endDate = stillWorking ? "" : securedPrompt.endDate;
    const error = validateEmploymentDates({ startDate, endDate }) || (!stillWorking && !endDate ? "Add the date you finished, or tick that you still work there." : "");
    if (error) {
      setSecuredPrompt(p => ({ ...p, error }));
      return;
    }
    const now = todayISO();
    const existing = appById(id);
    const wasSecured = existing?.status === SECURED_STATUS;
    const updated = apps.map(a => {
      if (a.id !== id) return a;
      const moved = a.status === SECURED_STATUS ? { ...a, updatedAt: now } : applyStatusTransition(a, SECURED_STATUS, now);
      return { ...moved, startDate, endDate };
    });
    const company = existing?.company || "this job";
    setApps(updated);
    persistToStorage(updated);
    setSecuredPrompt(null);
    showToast(wasSecured ? `Employment dates updated for ${company}` : `Congratulations on ${company}! Job secured.`);
  };
  const handleStatusChange = (id, status) => {
    // Securing a job needs dates for tenure analytics, so ask for them first.
    if (status === SECURED_STATUS) {
      openSecuredPrompt(id);
      return;
    }
    const previous = appById(id);
    if (!previous || previous.status === status) return;
    const updated = apps.map(a => a.id === id ? applyStatusTransition(a, status, todayISO()) : a);
    setApps(updated);
    persistToStorage(updated);
    // Undo restores just this application, so edits made elsewhere meanwhile survive.
    const undo = () => {
      commitApps(appsRef.current.map(a => a.id === id ? previous : a));
      showToast(`${previous.company} is back to ${previous.status}.`);
    };
    showToast(`${previous.company} moved to ${status}`, "success", { label: "Undo", run: undo });
  };
  // Sets the next follow-up reminder a number of days from today, for one or
  // many applications (snoozing a due one, or scheduling ones that have none).
  const setFollowUpIn = (ids, days, message) => {
    const now = todayISO();
    const targets = new Set(ids);
    const updated = apps.map(a => targets.has(a.id) ? { ...a, followUpDate: addDays(now, days), followUpStatus: "", updatedAt: now } : a);
    setApps(updated);
    persistToStorage(updated);
    showToast(message);
  };
  const handleFollowUpStatus = (id, followUpStatus) => {
    const now = todayISO();
    const updated = apps.map(a => {
      if (a.id !== id) return a;
      const history = Array.isArray(a.followUpHistory) ? a.followUpHistory : [];
      const nextFollowUpDate = ["messaged", "email_instead"].includes(followUpStatus) ? addDays(now, 7) : "";
      return {
        ...a,
        followUpStatus: nextFollowUpDate ? "" : followUpStatus,
        lastFollowUpStatus: followUpStatus,
        followUpDate: nextFollowUpDate,
        updatedAt: now,
        followUpHistory: [
          {
            id: nextId(),
            date: now,
            dueDate: a.followUpDate || "",
            method: FOLLOWUP_METHODS[followUpStatus] || FOLLOWUP_STATUS[followUpStatus]?.label || "Follow-up",
            outcome: FOLLOWUP_STATUS[followUpStatus]?.label || "Recorded",
            note: a.followUpNote || "",
          },
          ...history,
        ],
      };
    });
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
    showToast(`Exported ${apps.length} application${apps.length !== 1 ? "s" : ""}`);
  };

  // Spreadsheet export of whatever the Job Search list is currently showing.
  const handleExportCsv = () => {
    // The BOM makes Excel read the file as UTF-8 instead of mangling accents.
    const blob = new Blob(["\uFEFF" + toCSV(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-applications-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length} application${filtered.length !== 1 ? "s" : ""} to CSV`);
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
        const withIds = autoGhost(normalizeApplications(ensureIds(imported.apps)));
        // Merge: keep existing apps, add imported ones that don't already exist (by id)
        const existingIds = new Set(apps.map(a => a.id));
        const newApps = withIds.filter(a => !existingIds.has(a.id));
        if (newApps.length === 0) {
          // Every id already exists, so this is a restore rather than a merge.
          // Confirming through the app's own dialog keeps focus management and
          // styling consistent instead of handing off to a blocking native one.
          setImportPrompt({ apps: withIds, recovered: Boolean(imported.recovered) });
          return;
        }
        const merged = [...newApps, ...apps];
        setApps(merged);
        persistToStorage(merged);
        showToast(`Imported ${newApps.length} new application${newApps.length !== 1 ? "s" : ""} (${apps.length} existing kept)`);
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

  // Applies a full-backup restore once the user confirms it in-app.
  const confirmImportRestore = () => {
    if (!importPrompt) return;
    const { apps: restored, recovered } = importPrompt;
    setApps(restored);
    persistToStorage(restored);
    setImportPrompt(null);
    showToast(`Restored ${restored.length} application${restored.length !== 1 ? "s" : ""} from backup`);
    if (recovered) {
      setStorageHealth("warn");
      setStorageMessage("Imported a partially recovered backup.");
      showToast("Backup was partially recovered during import.", "error");
    }
  };

  const metrics = useMemo(() => buildTrackerMetrics(apps), [apps]);
  const today = metrics.today;
  const dueFollowUps = metrics.dueFollowUps;
  const { isDismissed, dismiss, restore } = useDismissals(today);
  // The banner only counts follow-ups still waiting in the Pipeline queue.
  const bannerDue = dueFollowUps.filter((app) => !isDismissed(dismissKey("due", app)));
  const bannerKey = dueBannerKey(bannerDue, today);
  const dismissPipelineItems = (keys, company) => {
    dismiss(keys);
    showToast(`Dismissed ${company} reminder`, "success", {
      label: "Undo",
      run: () => { restore(keys); showToast(`${company} reminder is back`); },
    });
  };
  const restorePipelineItems = (keys) => {
    restore(keys);
    showToast(`Restored ${keys.length} dismissed reminder${keys.length !== 1 ? "s" : ""}`);
  };

  const sorted = useMemo(() => sortApplications(apps, sortBy), [apps, sortBy]);

  const filtered = useMemo(
    () => filterApplications(sorted, { status: filterStatus, source: filterSource, search, needsAttention: onlyNeedsAttention }, today),
    [sorted, filterStatus, filterSource, search, onlyNeedsAttention, today],
  );

  const attentionCount = useMemo(() => apps.filter(a => needsAttention(a, today)).length, [apps, today]);

  const availableSources = useMemo(
    () => Array.from(new Set(apps.map(a => a.source).filter(Boolean))).sort(),
    [apps],
  );

  // Other applications at the company being typed into the form.
  const formCompany = form.company;
  const formRole = form.role;
  const duplicates = useMemo(
    () => (modalOpen ? findDuplicates(apps, { company: formCompany, role: formRole }, editId) : []),
    [modalOpen, apps, formCompany, formRole, editId],
  );

  const filtersActive = filterStatus !== "All" || filterSource !== "All" || onlyNeedsAttention || search.trim() !== "";
  const clearFilters = () => { setFilterStatus("All"); setFilterSource("All"); setOnlyNeedsAttention(false); setSearch(""); };

  const anyModalOpen = modalOpen || detailId !== null || deleteConfirmId !== null || shortcutsOpen || importPrompt !== null || gmailOpen || securedPrompt !== null;

  // Global shortcuts. Suppressed while typing or while a dialog owns the keyboard.
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing = target instanceof HTMLElement
        && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);

      if (event.key === "Escape" && !anyModalOpen && filtersActive) {
        clearFilters();
        return;
      }
      if (typing || anyModalOpen || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        setActiveTab("Job Search");
        // Wait for the Job Search panel to mount before reaching for its input.
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        openNewApplication();
      } else if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        setGmailOpen(true);
      } else if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (event.key >= "1" && event.key <= String(TABS.length)) {
        event.preventDefault();
        setActiveTab(TABS[Number(event.key) - 1].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anyModalOpen, filtersActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Roving focus across the tablist, as the tab role contract implies.
  const handleTabKeyDown = (event) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1 };
    let nextIndex = null;
    const current = TABS.findIndex(t => t.id === activeTab);
    if (event.key in keys) nextIndex = (current + keys[event.key] + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex];
    setActiveTab(next.id);
    document.getElementById(`tab-${next.id.replace(/\s+/g, "-").toLowerCase()}`)?.focus();
  };

  const todayCount = metrics.todayCount;
  const todayIsWeekend = isTodayWeekend();
  const responseRate = metrics.responseRate;
  const activeApplications = metrics.activeApplications;
  const interviewQueue = metrics.interviewQueue;
  const atRiskApps = metrics.atRiskApps;
  const freshThisWeek = metrics.freshThisWeek;
  const activeTabMeta = TABS.find(tab => tab.id === activeTab) || TABS[0];

  const countTopValues = (key) => Object.entries(apps.reduce((acc, app) => {
    const value = app[key]?.trim();
    if (!value || (key === "role" && !hasKnownRole(app))) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const roleFocus = useMemo(() => countTopValues("role"), [apps]); // eslint-disable-line react-hooks/exhaustive-deps
  const locationFocus = useMemo(() => countTopValues("location"), [apps]); // eslint-disable-line react-hooks/exhaustive-deps
  const latestApplications = sorted.filter(a => a.dateApplied).slice(0, 3);
  const currentJob = apps.find(a => a.status === SECURED_STATUS && employmentState(a, today) === "current");
  const homeInsight = currentJob
    ? `You're working at ${currentJob.company} (${formatTenure(tenureDays(currentJob, today))} so far). ${activeApplications > 0 ? `${activeApplications} other application${activeApplications !== 1 ? "s are" : " is"} still open.` : "Nice work closing out the search."}`
    : dueFollowUps.length > 0
    ? `You have ${dueFollowUps.length} follow-up${dueFollowUps.length !== 1 ? "s" : ""} due. The fastest win is to clear those first.`
    : interviewQueue.length > 0
      ? `You have ${interviewQueue.length} active interview or late-stage application${interviewQueue.length !== 1 ? "s" : ""} in play.`
      : `You have ${activeApplications} active application${activeApplications !== 1 ? "s" : ""} in motion. Keep the pipeline current at a pace that works for you.`;
  // "active" only when there is genuine activity to reflect; the weekend and
  // idle states both stay neutral so the banner never nags.
  const todayBannerTone = !todayIsWeekend && todayCount > 0 ? "active" : "neutral";
  const todayBannerMessage = todayIsWeekend
    ? (todayCount > 0
      ? `Weekend check-in: ${todayCount} application${todayCount !== 1 ? "s" : ""} logged today.`
      : "Weekend check-in. No pressure to log applications today.")
    : (todayCount > 0
      ? `You've logged ${todayCount} application${todayCount !== 1 ? "s" : ""} today.`
      : "No applications logged today yet. Use the tracker when you're ready.");
  const todayBannerHelper = dueFollowUps.length > 0
    ? `${dueFollowUps.length} follow-up${dueFollowUps.length !== 1 ? "s still need" : " still needs"} attention.`
    : "A quick update here keeps your pipeline accurate.";
  const detailApp = detailId !== null ? appById(detailId) : null;

  // Due follow-ups in the tab title, so a pinned tab shows what's waiting.
  const dueCount = dueFollowUps.length;
  useEffect(() => {
    const base = "Job Tracker Analytics";
    document.title = dueCount > 0 ? `(${dueCount}) ${base}` : base;
    return () => { document.title = base; };
  }, [dueCount]);
  const deleteApp = deleteConfirmId !== null ? appById(deleteConfirmId) : null;

  if (loading) return <div className="loading-shell"><p>Loading your tracker…</p></div>;

  const StorageIcon = storageHealth === "error" ? AlertTriangle : storageHealth === "warn" ? Database : CheckCircle2;
  // The control reflects the stored preference, so "system" stays visible as a
  // distinct state rather than masquerading as whichever theme it resolved to.
  const ThemeIcon = themePreference === "light" ? Sun : themePreference === "dark" ? Moon : MonitorIcon;
  const themeLabel = themePreference === "system" ? `System (${resolvedTheme})` : themePreference === "light" ? "Light" : "Dark";

  return (
    <div className="tracker-shell">

      <div className="tracker-header">
        <div className="tracker-header__inner">
          <div className="tracker-header__top">
            <div>
              <p className="tracker-kicker">Job Search Operating System</p>
              <h1 className="tracker-title">Adil's Job Tracker</h1>
              <p className="tracker-subtitle">{apps.length} total · {todayCount} today · {dueFollowUps.length} follow-up{dueFollowUps.length!==1?"s":""} due</p>
            </div>
            <div className="tracker-actions">
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="app-button app-button--ghost"
                  title="End your current session"
                >
                  <LogOut size={15} aria-hidden="true" />
                  Lock
                </button>
              )}
              {/* Was a div with onClick — unreachable by keyboard despite being
                  the quickest route to a backup. */}
              <button
                type="button"
                className={`storage-pill storage-pill--${storageHealth}`}
                onClick={handleExport}
                title={`${storageBackend} · ${storageMessage}. Click to export backup.`}
                aria-label={`Storage: ${storageBackend}, ${storageMessage}. Export backup.`}
              >
                <StorageIcon size={15} aria-hidden="true" />
                <span className="storage-pill__text" aria-hidden="true">
                  {storageBackend} · {storageMessage}
                </span>
              </button>
              <div className="icon-button-group">
                <button className="icon-button" onClick={handleExport} title="Export backup" aria-label="Export backup"><Download size={16} aria-hidden="true" /></button>
                <button className="icon-button" onClick={handleImport} title="Import backup" aria-label="Import backup"><Upload size={16} aria-hidden="true" /></button>
                <button
                  className="icon-button gmail-button"
                  data-state={gmail.syncing ? "syncing" : gmail.settings.connected || gmail.bridgeReady ? "on" : "off"}
                  onClick={()=>setGmailOpen(true)}
                  title={gmail.settings.connected ? `Gmail sync · ${gmail.settings.email || "connected"} (press G)` : "Connect Gmail (press G)"}
                  aria-label={gmail.settings.connected ? "Gmail sync settings" : "Connect Gmail"}
                >
                  <Mail size={16} aria-hidden="true" />
                </button>
                <button className="icon-button" onClick={()=>setShortcutsOpen(true)} title="Keyboard shortcuts (press ?)" aria-label="Show keyboard shortcuts"><Keyboard size={16} aria-hidden="true" /></button>
                <button
                  type="button"
                  className="theme-toggle"
                  onClick={cycleTheme}
                  title={`Theme: ${themeLabel}. Click to change.`}
                  aria-label={`Change theme. Current setting: ${themeLabel}`}
                >
                  <ThemeIcon size={16} aria-hidden="true" />
                </button>
              </div>
              <button onClick={openNewApplication} className="app-button app-button--primary">
                <Plus size={16} aria-hidden="true" />
                New Application
              </button>
            </div>
          </div>
          <div role="tablist" aria-label="Job tracker sections" className="tracker-tabs" onKeyDown={handleTabKeyDown}>
            {TABS.map(tab => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              const panelId = `tabpanel-${tab.id.replace(/\s+/g, "-").toLowerCase()}`;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id.replace(/\s+/g, "-").toLowerCase()}`}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={panelId}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  className="tracker-tab"
                  title={tab.description}
                >
                  <TabIcon size={16} strokeWidth={2.4} aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab.replace(/\s+/g, "-").toLowerCase()}`}
        aria-labelledby={`tab-${activeTab.replace(/\s+/g, "-").toLowerCase()}`}
        tabIndex={0}
        className="tracker-main"
      >

        <div className="dash-grid dash-grid--split">
          <SectionCard title={activeTabMeta.label} subtitle={activeTabMeta.description}>
            <p className="section-lede">{homeInsight}</p>
          </SectionCard>
          <SectionCard
            title="Today"
            subtitle="Quick pulse on the search"
            actions={
              <button
                type="button"
                className="soft-button soft-button--icon"
                disabled={gmail.syncing}
                onClick={() => ((gmail.settings.connected && gmail.settings.clientId) || gmail.bridgeReady ? gmail.sync({ interactive: true }) : setGmailOpen(true))}
                title={gmail.settings.connected ? "Check Gmail for new confirmations and rejections" : "Connect Gmail to log applications automatically"}
              >
                <Mail size={14} aria-hidden="true" />
                {gmail.syncing ? "Syncing…" : gmail.settings.connected || gmail.bridgeReady ? "Sync Gmail" : "Connect Gmail"}
              </button>
            }
          >
            <div className="pulse-grid">
              {[
                { label: "Applied", value: todayCount, token: "var(--status-applied)" },
                { label: "Due", value: dueFollowUps.length, token: "var(--status-followup)" },
                { label: "Interviews", value: interviewQueue.length, token: "var(--status-interview)" },
              ].map((item) => (
                <div key={item.label} className="pulse-item" style={{ "--pulse-ink": item.token }}>
                  <div className="pulse-item__value">{item.value}</div>
                  <div className="pulse-item__label">{item.label}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {ghostedBanner.length > 0 && (
          <div className="banner">
            <div>
              <p className="banner__title">
                <span aria-hidden="true">👻 </span>
                {ghostedBanner.length} application{ghostedBanner.length !== 1 ? "s have" : " has"} been auto-marked as Ghosted (no response after {GHOST_DAYS} days):
              </p>
              {ghostedBanner.map((a, i) => (
                <p key={a.id || i} className="banner__line">→ <strong>{a.company}</strong> — {a.role} (applied {formatDate(a.dateApplied)})</p>
              ))}
              <button type="button" className="banner__dismiss" onClick={() => setGhostedBanner([])}>Dismiss</button>
            </div>
          </div>
        )}

        {bannerDue.length > 0 && activeTab !== "Pipeline" && !isDismissed(bannerKey) && (
          <div className="banner" data-tone="warning">
            <p className="banner__title">
              <span aria-hidden="true">🔔 </span>
              {bannerDue.length} follow-up{bannerDue.length !== 1 ? "s are" : " is"} due.
            </p>
            <div className="banner__actions">
              <button type="button" className="banner__count" onClick={() => setActiveTab("Pipeline")}>
                Open Pipeline
              </button>
              <button
                type="button"
                className="banner__close"
                aria-label="Dismiss follow-up notification until tomorrow"
                title="Hide until tomorrow, or until another follow-up falls due"
                onClick={() => dismiss([bannerKey])}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* The daily logging nudge would only push the two review tabs down. */}
        {activeTab !== "Pipeline" && activeTab !== "Analytics" && (
          <div className="banner" data-tone={todayBannerTone}>
            <div>
              <p className="banner__title">
                <span aria-hidden="true">{todayIsWeekend ? "🛋️ " : "📆 "}</span>{todayBannerMessage}
              </p>
              <p className="banner__helper">{todayBannerHelper}</p>
            </div>
            <div className="banner__count">{todayCount} logged today</div>
          </div>
        )}

        {activeTab === "Home" && (
          <>
            <div className="stat-grid">
              {[
                { label: "Active Search", value: activeApplications, note: "roles still in play" },
                { label: "This Week", value: freshThisWeek, note: "applications added", tone: freshThisWeek === 0 ? "idle" : null },
                { label: "Follow-Ups Due", value: dueFollowUps.length, note: "priority actions", tone: dueFollowUps.length > 0 ? "attention" : "idle" },
                { label: "Interview Queue", value: interviewQueue.length, note: "late-stage roles", tone: interviewQueue.length > 0 ? "active" : "idle" },
              ].map((card) => (
                <div key={card.label} className={`stat-card${card.tone ? ` stat-card--${card.tone}` : ""}`}>
                  <div className="stat-card__label">{card.label}</div>
                  <div className="stat-card__value">{card.value}</div>
                  <div className="stat-card__note">{card.note}</div>
                </div>
              ))}
            </div>

            <SectionCard
              title="Priority Queue"
              subtitle="Automatically generated workflow actions from your tracker data."
              actions={<button onClick={() => setActiveTab("Analytics")} className="soft-button">Open Analytics</button>}
              className="section-card--spaced"
            >
              {metrics.nextActions.length > 0 ? (
                <div className="dash-grid dash-grid--tight dash-grid--flush">
                  {metrics.nextActions.slice(0, 4).map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className="action-tile"
                      data-tone={action.tone}
                      onClick={() => {
                        if (action.id === "secured-dates") {
                          clearFilters(); setFilterStatus(SECURED_STATUS);
                          setActiveTab("Job Search");
                          return;
                        }
                        if (action.id === "close-offers") {
                          setActiveTab("Pipeline");
                          return;
                        }
                        if (action.id === "review-email") {
                          setFilterStatus("All"); setFilterSource("All"); setOnlyNeedsAttention(false); setSearch(UNKNOWN_ROLE);
                          setActiveTab("Job Search");
                          return;
                        }
                        setActiveTab(action.tone === "interview" ? "Interview Prep" : action.tone === "risk" || action.tone === "warning" ? "Pipeline" : "Job Search");
                      }}
                    >
                      <div className="action-tile__label">{action.label}</div>
                      <div className="action-tile__detail">{action.detail}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted-note">No urgent actions. Keep adding applications, updating outcomes, and logging follow-ups.</p>
              )}
            </SectionCard>

            <div className="dash-grid dash-grid--auto">
              <SectionCard
                title="Welcome Back"
                subtitle="A quick read on where your search stands right now."
                actions={<button onClick={openNewApplication} className="soft-button">Add Application</button>}
              >
                <div className="stack">
                  {[
                    dueFollowUps.length > 0 ? `Clear ${dueFollowUps.length} overdue follow-up${dueFollowUps.length !== 1 ? "s" : ""} to keep momentum.` : "No overdue follow-ups right now.",
                    atRiskApps.length > 0 ? `${atRiskApps.length} application${atRiskApps.length !== 1 ? "s are" : " is"} close to ghosting. Consider nudging the strongest ones.` : "No immediate ghost-risk applications this week.",
                    responseRate > 0 ? `Your current response rate is ${responseRate}%. Keep targeting similar roles and companies.` : "You are still early in the cycle. Keep the tracker current and focus on the roles that fit best.",
                  ].map((item) => (
                    <div key={item} className="note-item">{item}</div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Search Focus" subtitle="Patterns from your current applications.">
                <div className="stack stack--wide">
                  <div>
                    <div className="field-group__label">Top Roles</div>
                    <div className="chip-row">
                      {roleFocus.length > 0 ? roleFocus.map(([role, count]) => (
                        <span key={role} className="focus-chip">
                          {role} <span className="focus-chip__count">{count}</span>
                        </span>
                      )) : <span className="muted-note">No role pattern yet.</span>}
                    </div>
                  </div>
                  <div>
                    <div className="field-group__label">Top Locations</div>
                    <div className="chip-row">
                      {locationFocus.length > 0 ? locationFocus.map(([location, count]) => (
                        <span key={location} className="focus-chip focus-chip--neutral">
                          {location} <span className="focus-chip__count">{count}</span>
                        </span>
                      )) : <span className="muted-note">No location pattern yet.</span>}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="dash-grid dash-grid--wide dash-grid--flush">
              <SectionCard
                title="Latest Applications"
                subtitle="Your newest entries and their current status."
                actions={<button onClick={() => setActiveTab("Job Search")} className="soft-button">Open Job Search</button>}
              >
                {latestApplications.length > 0 ? latestApplications.map((app) => (
                  <div key={app.id} className="queue-row">
                    <div>
                      <div className="queue-row__name">{app.company}</div>
                      <div className="queue-row__detail">{app.role} · {formatDate(app.dateApplied)}</div>
                    </div>
                    <Badge status={app.status} interviewStage={app.interviewStage} />
                  </div>
                )) : <p className="muted-note">No applications yet.</p>}
              </SectionCard>

              <SectionCard
                title="Next Best Actions"
                subtitle="Use these shortcuts to keep the workflow moving."
              >
                <div className="stack">
                  {[
                    { label: "Review follow-ups", helper: `${dueFollowUps.length} due right now`, action: () => setActiveTab("Pipeline") },
                    { label: "Update search list", helper: `${filtered.length} visible application${filtered.length !== 1 ? "s" : ""}`, action: () => setActiveTab("Job Search") },
                    { label: "Check performance", helper: `${responseRate}% response rate`, action: () => setActiveTab("Analytics") },
                  ].map((item) => (
                    <button key={item.label} onClick={item.action} className="tile-button">
                      <div className="tile-button__label">{item.label}</div>
                      <div className="tile-button__helper">{item.helper}</div>
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
              className="section-card--spaced"
            >
              {/* Buttons rather than clickable divs: these are the primary way
                  to filter the list, so they must be tabbable and expose their
                  pressed state. */}
              <div className="status-filter-grid">
                {[{ label: "All", count: apps.length }, ...Object.keys(STATUS_CONFIG).map(s => ({ label: s, count: apps.filter(a => a.status === s).length }))].map(s => (
                  <button
                    key={s.label}
                    type="button"
                    className="status-filter"
                    data-status={s.label === "All" ? undefined : s.label}
                    aria-pressed={filterStatus === s.label}
                    aria-label={`Filter by ${s.label}: ${s.count} application${s.count !== 1 ? "s" : ""}`}
                    onClick={() => setFilterStatus(s.label)}
                  >
                    <div className="status-filter__count">{s.count}</div>
                    <div className="status-filter__label">{s.label}</div>
                  </button>
                ))}
              </div>
            </SectionCard>

            <div className="search-toolbar">
              <input
                ref={searchInputRef}
                type="search"
                className="search-input"
                aria-label="Search applications by company, role, location, source, notes or hiring manager"
                placeholder="Search company, role, location, notes…  (press /)"
                value={search}
                onChange={e=>setSearch(e.target.value)}
              />
              <select className="search-select" aria-label="Filter by source" value={filterSource} onChange={e=>setFilterSource(e.target.value)}>
                <option value="All">Source: All</option>
                {availableSources.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="search-select" aria-label="Sort applications" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
                <option value="date">Sort: Date</option>
                <option value="company">Sort: Company</option>
                <option value="status">Sort: Status</option>
                <option value="updated">Sort: Last updated</option>
              </select>
            </div>

            <div className="filter-row">
              <button
                type="button"
                className="filter-toggle"
                aria-pressed={onlyNeedsAttention}
                onClick={()=>setOnlyNeedsAttention(v=>!v)}
              >
                <span aria-hidden="true">⚡ </span>Needs attention {attentionCount > 0 && `· ${attentionCount}`}
              </button>
              <span className="filter-count">
                Showing <strong>{filtered.length}</strong> of {apps.length}
              </span>
              {filtersActive && (
                <button type="button" className="clear-filters" onClick={clearFilters}>
                  Clear filters <span className="hint">(Esc)</span>
                </button>
              )}
              {filtered.length > 0 && (
                <button type="button" className="clear-filters filter-row__end" onClick={handleExportCsv} title="Download the applications shown below as a spreadsheet">
                  <Download size={13} aria-hidden="true" /> Export CSV
                </button>
              )}
            </div>

            {filtered.length===0 ? (
              <div className="empty-state">
                <p className="empty-state__icon" aria-hidden="true">📭</p>
                <p className="empty-state__text">{apps.length===0?"No applications yet — add your first one!":"No results match your filter."}</p>
                {apps.length===0 ? (
                  <button type="button" className="modal-button modal-button--primary" onClick={openNewApplication}>Add your first application</button>
                ) : filtersActive && (
                  <button type="button" className="modal-button modal-button--secondary" onClick={clearFilters}>Clear filters</button>
                )}
              </div>
            ) : filtered.map(app => {
              const isOverdue = app.followUpDate && app.followUpDate<=today && !CLOSED_STATUSES.includes(app.status);
              const dLeft = daysUntilGhost(app);
              const warningSoon = dLeft!==null && dLeft<=5 && dLeft>0;
              return (
                <div key={app.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open details for ${app.company} — ${app.role}`}
                  onClick={()=>setDetailId(app.id)}
                  onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); setDetailId(app.id); } }}
                  className="application-card"
                  data-flag={isOverdue ? "overdue" : warningSoon ? "ghost-risk" : undefined}>
                  <div className="application-card__top">
                    <div className="application-card__main">
                      <div className="application-card__titles">
                        <span className="application-card__company">{app.company}</span>
                        <Badge status={app.status} interviewStage={app.interviewStage}/>
                        {app.interviewStage && !["Rejected","Withdrawn","Ghosted"].includes(app.status) && <span className="stage-pill">{app.interviewStage}</span>}
                        {app.interviewDate && app.interviewDate>=today && !["Rejected","Withdrawn","Ghosted",SECURED_STATUS].includes(app.status) && <span className="inline-flag inline-flag--interview"><span aria-hidden="true">🗓️ </span>Interview {relativeDay(app.interviewDate, today)}</span>}
                        {isOverdue&&<span className="inline-flag inline-flag--overdue"><span aria-hidden="true">🔔 </span>FOLLOW-UP DUE</span>}
                        {isOverdue && app.followUpStatus && (() => { const fs=FOLLOWUP_STATUS[app.followUpStatus]; return <span className="status-badge" data-status={fs.statusToken}><span aria-hidden="true">{fs.emoji}</span> {fs.label}</span>; })()}
                        {warningSoon&&<span className="inline-flag inline-flag--risk"><span aria-hidden="true">⏳ </span>{dLeft}d to ghost</span>}
                        {app.autoGhosted&&<span className="inline-flag inline-flag--muted">auto-ghosted</span>}
                        {app.fromEmail&&<span className="inline-flag inline-flag--email" title="Added automatically from Gmail. Check the details."><span aria-hidden="true">📧 </span>from Gmail{!hasKnownRole(app)?" · add role":""}</span>}
                        {!app.fromEmail&&app.emailUpdated&&<span className="inline-flag inline-flag--email" title="Status updated from an email"><span aria-hidden="true">📧 </span>email update</span>}
                      </div>
                      <p className="application-card__meta">{app.role}{app.location?` · ${app.location}`:""}{app.source?` · ${app.source}`:""} · Applied {formatDate(app.dateApplied)}{app.salary?` · ${app.salary}`:""}{app.hiringManager&&app.hiringManager!=="Not Available"?` · ${app.hiringManager}`:""}</p>
                      {app.status===SECURED_STATUS&&<p className="application-card__meta"><span aria-hidden="true">🏆 </span>{employmentSummary(app, today)}</p>}
                    </div>
                    <div className="application-card__actions" onClick={e=>e.stopPropagation()}>
                      <select className="status-select" aria-label={`Change status for ${app.company}`} value={app.status} onChange={e=>handleStatusChange(app.id,e.target.value)}>
                        {Object.keys(STATUS_CONFIG).map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                      <button type="button" className="chip-button chip-button--accent" onClick={()=>openEdit(app.id)}>Edit</button>
                      <button type="button" className="chip-button chip-button--danger" aria-label={`Remove ${app.company}`} onClick={()=>setDeleteConfirmId(app.id)}>Remove</button>
                    </div>
                  </div>
                  {app.notes&&<p className="application-card__notes"><span aria-hidden="true">📝 </span>{app.notes}</p>}
                </div>
              );
            })}
          </>
        )}

        {activeTab === "Pipeline" && (
          <PipelineView
            apps={apps}
            metrics={metrics}
            today={today}
            isDismissed={isDismissed}
            onDismiss={dismissPipelineItems}
            onRestore={restorePipelineItems}
            onFollowUp={handleFollowUpStatus}
            onSchedule={setFollowUpIn}
            onOpen={setDetailId}
            onSecured={openSecuredPrompt}
            onPrep={() => setActiveTab("Interview Prep")}
            onShowStatus={(status) => { clearFilters(); setFilterStatus(status); setActiveTab("Job Search"); }}
          />
        )}

        {activeTab === "Analytics" && (
          <Suspense fallback={<div className="suspense-fallback">Loading analytics…</div>}>
            <AnalyticsView apps={apps} theme={resolvedTheme} />
          </Suspense>
        )}

        {activeTab === "Interview Prep" && (
          <Suspense fallback={<div className="suspense-fallback">Loading interview prep…</div>}>
            <InterviewPrep apps={apps} />
          </Suspense>
        )}
      </div>

      <footer className="tracker-footer">
        Live build v{__APP_VERSION__} · updated {__BUILD_DATE__} · encrypted starter data, browser-first storage, GitHub Pages deployment
      </footer>

      <Modal label={editId!==null?"Edit application":"New application"} open={modalOpen} onClose={()=>{setModalOpen(false);setEditId(null);setForm(EMPTY_FORM);setFormError("");}}>
        <div className="modal-header">
          <h2 className="modal-title">{editId!==null?"Edit Application":"New Application"}</h2>
        </div>
        <div className="modal-body--flush">
          <div className="form-grid">
            <Field label="Company" value={form.company} onChange={f("company")} placeholder="e.g. Google" required/>
            <Field label="Role" value={form.role} onChange={f("role")} placeholder="e.g. Data Engineer" required/>
            <Field label="Location" value={form.location} onChange={f("location")} placeholder="London / Remote"/>
            <Field label="Source" value={form.source} onChange={f("source")} as="select" options={APPLICATION_SOURCES}/>
            <Field label="Date Applied" value={form.dateApplied} onChange={f("dateApplied")} type="date" required/>
            <Field label="Status" value={form.status} onChange={f("status")} as="select" options={Object.keys(STATUS_CONFIG)}/>
            <Field label="Interview Stage" value={form.interviewStage} onChange={f("interviewStage")} as="select" options={INTERVIEW_STAGES}/>
            <Field label="Interview Date" value={form.interviewDate} onChange={f("interviewDate")} type="date"/>
            <Field label="Salary" value={form.salary} onChange={f("salary")} placeholder="e.g. £55k–£65k"/>
            <Field label="Job URL" value={form.jobUrl} onChange={f("jobUrl")} placeholder="https://..."/>
            <Field label="Follow-Up Date" value={form.followUpDate} onChange={f("followUpDate")} type="date"/>
            <Field label="Follow-Up Note" value={form.followUpNote} onChange={f("followUpNote")} placeholder="What should you mention next?"/>

            {/* Hiring Manager — inline availability dropdown */}
            <div className="field">
              <label className="field__label" htmlFor="hm-name">Hiring Manager</label>
              <div className="field__split">
                <select className="field__control" aria-label="Hiring manager availability" value={form.hmAvailable?"available":"na"}
                  onChange={e=>{const avail=e.target.value==="available";setForm(p=>({...p,hmAvailable:avail,hiringManager:avail?(p.hiringManager==="Not Available"?"":p.hiringManager):"Not Available"}));}}>
                  <option value="available">Known</option>
                  <option value="na">N/A</option>
                </select>
                <input id="hm-name" className="field__control" value={form.hmAvailable?form.hiringManager:""} onChange={e=>f("hiringManager")(e.target.value)}
                  placeholder={form.hmAvailable?"e.g. Sarah Jones":"Not available"}
                  disabled={!form.hmAvailable}/>
              </div>
            </div>

            {/* HM LinkedIn — inline availability dropdown */}
            <div className="field">
              <label className="field__label" htmlFor="hm-linkedin">HM LinkedIn</label>
              <div className="field__split">
                <select className="field__control" aria-label="Hiring manager LinkedIn availability" value={form.hmLinkedInAvailable?"available":"na"}
                  onChange={e=>{const avail=e.target.value==="available";setForm(p=>({...p,hmLinkedInAvailable:avail,hmLinkedIn:avail?p.hmLinkedIn:""}));}}>
                  <option value="available">Available</option>
                  <option value="na">N/A</option>
                </select>
                <input id="hm-linkedin" className="field__control" value={form.hmLinkedInAvailable?form.hmLinkedIn:""} onChange={e=>f("hmLinkedIn")(e.target.value)}
                  placeholder={form.hmLinkedInAvailable?"https://linkedin.com/in/...":"Not available"}
                  disabled={!form.hmLinkedInAvailable}/>
              </div>
            </div>
          </div>
          {form.status === SECURED_STATUS && (
            <div className="employment-panel" role="group" aria-label="Employment">
              <p className="employment-panel__title"><span aria-hidden="true">🏆 </span>Employment</p>
              <div className="form-grid">
                <Field label="Start Date" value={form.startDate} onChange={f("startDate")} type="date" required/>
                <div className="field">
                  <span className="field__label">Still working there?</span>
                  <label className="field__check">
                    <input type="checkbox" checked={!form.endDate}
                      onChange={e=>setForm(p=>({...p,endDate:e.target.checked?"":todayISO()}))}/>
                    Yes, this is my current job
                  </label>
                </div>
                {form.endDate && <Field label="Finish Date" value={form.endDate} onChange={f("endDate")} type="date"/>}
                {form.startDate && form.startDate <= todayISO() && (
                  <div className="field">
                    <span className="field__label">Time Worked</span>
                    <div className="field__check">{formatTenure(tenureDays(form))}</div>
                  </div>
                )}
              </div>
            </div>
          )}
          <Field label="Notes" value={form.notes} onChange={f("notes")} as="textarea" placeholder="Interview feedback, key contacts, how you found the role…" rows={3}/>
          {duplicates.length > 0 && (
            <p className="form-notice" role="status">
              <span aria-hidden="true">👀 </span>
              You already have {duplicates.length} application{duplicates.length !== 1 ? "s" : ""} at {duplicates[0].app.company}
              {duplicates.some(d => d.sameRole) ? ", including this role" : ""}:{" "}
              {duplicates.slice(0, 3).map(d => `${d.app.role} (${d.app.status}, applied ${formatDate(d.app.dateApplied)})`).join("; ")}
              {duplicates.length > 3 ? "…" : ""}
            </p>
          )}
          {formError && (
            <p className="form-error" role="alert">
              <span aria-hidden="true">⚠️ </span>{formError}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="modal-button modal-button--neutral" onClick={()=>{setModalOpen(false);setEditId(null);setForm(EMPTY_FORM);setFormError("");}}>Cancel</button>
          <button type="button" className="modal-button modal-button--primary" onClick={handleSubmit}>{editId!==null?"Save Changes":"Add Application"}</button>
        </div>
      </Modal>

      <Modal label={detailApp ? `${detailApp.company} application details` : "Application details"} open={detailApp!==null} onClose={()=>setDetailId(null)}>
        {detailApp&&(()=>{
          const a=detailApp;
          const dLeft=daysUntilGhost(a);
          return (
            <>
              <div className="modal-header">
                <div className="modal-header__row">
                  <h2 className="modal-title">{a.company}</h2>
                  <Badge status={a.status} interviewStage={a.interviewStage}/>
                  {a.interviewStage && !["Rejected","Withdrawn","Ghosted"].includes(a.status) && <span className="stage-pill">{a.interviewStage}</span>}
                </div>
                <p className="modal-subtitle">{a.role}{a.location?` · ${a.location}`:""}</p>
                {dLeft!==null&&dLeft<=7&&dLeft>0&&<p className="modal-warning"><span aria-hidden="true">⏳ </span>Auto-ghosted in {dLeft} day{dLeft!==1?"s":""} if no update</p>}
              </div>
              <div className="modal-body kv-grid">
                {[["Date Applied",formatDate(a.dateApplied)],["Days Since Applied",daysSince(a.dateApplied)+" days"],["Source",a.source||"—"],["Salary",a.salary||"—"],["Follow-Up",a.followUpDate?`${formatDate(a.followUpDate)} (${relativeDay(a.followUpDate)})`:"—"],["Interview Date",a.interviewDate?`${formatDate(a.interviewDate)} (${relativeDay(a.interviewDate)})`:"—"],["Hiring Manager",a.hiringManager||"—"]].map(([l,v])=>(
                  <div key={l}>
                    <div className="kv-label">{l}</div>
                    <div className="kv-value">{v}</div>
                  </div>
                ))}
                {a.status===SECURED_STATUS&&<>
                  <div><div className="kv-label">Started</div><div className="kv-value">{a.startDate||"—"}</div></div>
                  <div><div className="kv-label">Finished</div><div className="kv-value">{a.endDate||(a.startDate?"Current job":"—")}</div></div>
                  <div className="kv-item--full">
                    <div className="kv-label">Time Worked</div>
                    <div className="kv-value">{employmentSummary(a)}</div>
                  </div>
                </>}
                {a.jobUrl&&<div className="kv-item--full"><div className="kv-label">Job Posting</div><a href={a.jobUrl} target="_blank" rel="noreferrer" className="kv-link">Open ↗</a></div>}
                {a.hmLinkedIn&&<div className="kv-item--full"><div className="kv-label">HM LinkedIn</div><a href={a.hmLinkedIn} target="_blank" rel="noreferrer" className="kv-link">Open LinkedIn ↗</a></div>}
                {a.followUpDate&&<div className="kv-item--full">
                  <div className="kv-label">Follow-Up Status</div>
                  <div className="chip-row">
                    {Object.entries(FOLLOWUP_STATUS).filter(([k])=>k!=="").map(([k,fs])=>(
                      <button
                        key={k}
                        type="button"
                        className="chip-button"
                        data-status={fs.statusToken}
                        style={{ "--c-ink": "var(--s-ink)", "--c-bg": "var(--s-bg)", "--c-border": "var(--s-border)" }}
                        aria-pressed={a.followUpStatus===k}
                        onClick={()=>handleFollowUpStatus(a.id,k)}
                      >
                        <span aria-hidden="true">{fs.emoji}</span> {fs.label}
                      </button>
                    ))}
                  </div>
                </div>}
                {Array.isArray(a.followUpHistory) && a.followUpHistory.length > 0 && (
                  <div className="kv-item--full">
                    <div className="kv-label">Follow-Up History</div>
                    <div className="stack">
                      {a.followUpHistory.slice(0, 5).map((item) => (
                        <div key={item.id || `${item.date}-${item.method}`} className="history-item">
                          <div className="history-item__head">
                            <span>{item.method || "Follow-up"} · {item.outcome || "Recorded"}</span>
                            <span className="history-item__date">{formatDate(item.date)}</span>
                          </div>
                          {item.note && <div className="history-item__note">{item.note}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(a.emailLog) && a.emailLog.length > 0 && (
                  <div className="kv-item--full">
                    <div className="kv-label">Email Activity</div>
                    <div className="stack">
                      {a.emailLog.slice(0, 5).map((item) => (
                        <div key={item.messageId} className="history-item">
                          <div className="history-item__head">
                            <span>{item.type === "rejected" ? "Rejection" : item.type === "interview" ? "Interview invite" : "Application confirmation"}</span>
                            <a className="history-item__date kv-link" href={`https://mail.google.com/mail/u/0/#all/${item.messageId}`} target="_blank" rel="noreferrer">{formatDate(item.date)} ↗</a>
                          </div>
                          {item.subject && <div className="history-item__note">{item.subject}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {a.notes&&<div className="kv-item--full"><div className="kv-label">Notes</div><div className="kv-note">{a.notes}</div></div>}
                <div className="kv-item--full">
                  <div className="kv-label">Timeline</div>
                  <ol className="timeline">
                    {buildTimeline(a).map((event, i) => (
                      <li key={`${event.date}-${event.label}-${i}`} className="timeline__item">
                        <span className="timeline__date">{formatDate(event.date)}</span>
                        <span className="timeline__label">{event.label}{event.detail ? <span className="timeline__detail"> · {event.detail}</span> : null}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <div className="modal-actions">
                {(a.status==="Offer"||a.status===SECURED_STATUS)&&(
                  <button type="button" className="modal-button modal-button--secondary" onClick={()=>{setDetailId(null);openSecuredPrompt(a.id);}}>
                    {a.status===SECURED_STATUS?(a.endDate?"Edit employment dates":"Record finish date"):"Mark job secured"}
                  </button>
                )}
                <button type="button" className="modal-button modal-button--secondary" onClick={()=>{setDetailId(null);openEdit(a.id);}}>Edit</button>
                <button type="button" className="modal-button modal-button--primary" onClick={()=>setDetailId(null)}>Close</button>
              </div>
            </>
          );
        })()}
      </Modal>

      <Modal label="Confirm removal" open={deleteApp!==null} onClose={()=>setDeleteConfirmId(null)}>
        <div className="modal-header">
          <h2 className="modal-title">Remove Application?</h2>
          <p className="modal-subtitle">Permanently delete <strong>{deleteApp?.company}</strong>? You can undo this from the toast straight afterwards.</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="modal-button modal-button--neutral" onClick={()=>setDeleteConfirmId(null)}>Cancel</button>
          <button type="button" className="modal-button modal-button--danger" onClick={()=>{ if (deleteConfirmId !== null) handleDelete(deleteConfirmId); }}>Delete</button>
        </div>
      </Modal>

      <Modal label="Confirm backup restore" open={importPrompt!==null} onClose={()=>setImportPrompt(null)}>
        <div className="modal-header">
          <h2 className="modal-title">Restore From Backup?</h2>
          <p className="modal-subtitle">
            This backup contains {importPrompt?.apps.length} application{importPrompt?.apps.length !== 1 ? "s" : ""} that all match records you already have.
            Restoring replaces your current {apps.length} application{apps.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="modal-button modal-button--neutral" onClick={()=>setImportPrompt(null)}>Cancel</button>
          <button type="button" className="modal-button modal-button--primary" onClick={confirmImportRestore}>Replace All</button>
        </div>
      </Modal>

      <Modal label="Job secured" open={securedPrompt!==null} onClose={()=>setSecuredPrompt(null)}>
        {securedPrompt&&(()=>{
          const target=appById(securedPrompt.id);
          const p=securedPrompt;
          const set=(patch)=>setSecuredPrompt(prev=>({...prev,...patch,error:""}));
          const endDate=p.stillWorking?"":p.endDate;
          const preview=p.startDate&&p.startDate<=todayISO()?tenureDays({startDate:p.startDate,endDate}):null;
          return (
            <>
              <div className="modal-header">
                <h2 className="modal-title"><span aria-hidden="true">🏆 </span>{target?.status===SECURED_STATUS?"Employment Details":"Job Secured"}</h2>
                <p className="modal-subtitle">
                  {target?.company}{target?.role?` — ${target.role}`:""}. Add your dates so analytics can track how long you worked there.
                </p>
              </div>
              <div className="modal-body--flush">
                <div className="form-grid">
                  <Field label="Start Date" value={p.startDate} onChange={v=>set({startDate:v})} type="date" required/>
                  <div className="field">
                    <span className="field__label">Still working there?</span>
                    <label className="field__check">
                      <input type="checkbox" checked={p.stillWorking}
                        onChange={e=>set({stillWorking:e.target.checked,endDate:e.target.checked?p.endDate:(p.endDate||todayISO())})}/>
                      Yes, this is my current job
                    </label>
                  </div>
                  {!p.stillWorking&&<Field label="Finish Date" value={p.endDate} onChange={v=>set({endDate:v})} type="date" required/>}
                  {preview!==null&&(
                    <div className="field">
                      <span className="field__label">Time Worked</span>
                      <div className="field__check">{formatTenure(preview)}</div>
                    </div>
                  )}
                </div>
                {p.error&&<p className="form-error" role="alert"><span aria-hidden="true">⚠️ </span>{p.error}</p>}
              </div>
              <div className="modal-footer">
                <button type="button" className="modal-button modal-button--neutral" onClick={()=>setSecuredPrompt(null)}>Cancel</button>
                <button type="button" className="modal-button modal-button--primary" onClick={confirmSecured}>Save</button>
              </div>
            </>
          );
        })()}
      </Modal>

      <Modal label="Gmail sync" open={gmailOpen} onClose={()=>setGmailOpen(false)}>
        <GmailPanel
          gmail={gmail}
          onClose={()=>setGmailOpen(false)}
          onOpenApp={(id)=>{ if (appById(id)) { setGmailOpen(false); setDetailId(id); } }}
        />
      </Modal>

      {/* Live region stays mounted so screen readers reliably announce updates. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="toast-region">
        {toast && (
          <div className={`toast${toast.type==="error"?" toast--error":""}`}>
            <span><span aria-hidden="true">{toast.type==="error"?"⚠️ ":"✅ "}</span>{toast.msg}</span>
            {toast.action && (
              <button type="button" className="toast__action" onClick={()=>{ toast.action.run(); }}>
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>

      <Modal label="Keyboard shortcuts" open={shortcutsOpen} onClose={()=>setShortcutsOpen(false)}>
        <div className="modal-header">
          <h2 className="modal-title">Keyboard Shortcuts</h2>
        </div>
        <div className="modal-body stack">
          {[
            ["/", "Jump to search"],
            ["N", "New application"],
            ["1 – 5", "Switch between tabs"],
            ["← →", "Move across tabs when one is focused"],
            ["Esc", "Close a dialog, or clear active filters"],
            ["G", "Gmail sync"],
            ["?", "Show this list"],
          ].map(([keys, description]) => (
            <div key={keys} className="shortcut-row">
              <span>{description}</span>
              <kbd>{keys}</kbd>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-button modal-button--primary" onClick={()=>setShortcutsOpen(false)}>Close</button>
        </div>
      </Modal>
    </div>
  );
}
