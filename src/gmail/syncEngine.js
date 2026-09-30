import { CLOSED_STATUSES } from "../constants";
import { applyStatusTransition, normalizeApplication } from "../utils/applicationLifecycle";
import { daysBetween } from "../utils/dates";
import { normalizeCompany } from "./emailClassifier";

// A confirmation within this many days of an existing application to the
// same company is treated as the same application, not a new one.
const DUPLICATE_WINDOW_DAYS = 45;

function companiesMatch(a, b) {
  const left = normalizeCompany(a);
  const right = normalizeCompany(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // "Monzo" vs "Monzo Bank": allow containment on whole words only, and only
  // when the shorter side is distinctive enough not to match by accident.
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
}

function roleOverlap(a, b) {
  const words = (value) => new Set(normalizeCompany(value).split(" ").filter((word) => word.length > 2));
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  left.forEach((word) => { if (right.has(word)) shared += 1; });
  return shared / Math.min(left.size, right.size);
}

/**
 * Pick the application an email most likely refers to. Role overlap breaks
 * ties between several applications to one company; recency breaks the rest.
 */
export function findMatchingApplication(apps, event, { openOnly = false } = {}) {
  const candidates = apps.filter((app) => {
    if (!companiesMatch(app.company, event.company)) return false;
    if (openOnly && CLOSED_STATUSES.includes(app.status) && app.status !== "Ghosted") return false;
    return true;
  });
  if (candidates.length === 0) return null;
  return candidates
    .map((app) => ({ app, score: event.role ? roleOverlap(app.role, event.role) : 0 }))
    .sort((a, b) => b.score - a.score || (b.app.dateApplied || "").localeCompare(a.app.dateApplied || ""))[0].app;
}

function emailEntry(event) {
  return { messageId: event.messageId, type: event.type, date: event.date, subject: event.subject };
}

function withEmail(app, event) {
  const log = Array.isArray(app.emailLog) ? app.emailLog : [];
  if (log.some((entry) => entry.messageId === event.messageId)) return app;
  return { ...app, emailLog: [emailEntry(event), ...log].slice(0, 20) };
}

const STATUS_FOR_EVENT = { applied: "Applied", rejected: "Rejected", interview: "Interview" };

/**
 * Apply classified email events to the application list.
 *
 * Events are applied oldest-first so a confirmation and a rejection for the
 * same role in one sync end up as "added, then rejected". Returns the new
 * list plus a human-readable change log the UI can show and undo.
 *
 * @param {object[]} apps
 * @param {object[]} events  output of classifyEmail, nulls removed
 * @param {{ makeId: () => number, today: string }} options
 */
export function applyEmailEvents(apps, events, { makeId, today }) {
  let next = [...apps];
  const changes = [];
  const ordered = [...events].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  for (const event of ordered) {
    const eventDate = event.date || today;

    if (event.type === "applied") {
      const existing = findMatchingApplication(next, event);
      const sameApplication = existing
        && (!existing.dateApplied || Math.abs(daysBetween(existing.dateApplied, eventDate)) <= DUPLICATE_WINDOW_DAYS)
        && (!event.role || !existing.role || roleOverlap(existing.role, event.role) > 0 || existing.role.startsWith("Role not"));
      if (sameApplication) {
        next = next.map((app) => (app.id === existing.id ? withEmail(app, event) : app));
        continue;
      }
      next = [createFromEvent(event, "Applied", makeId, today), ...next];
      changes.push({ kind: "added", company: event.company, role: event.role, status: "Applied", messageId: event.messageId, appId: next[0].id });
      continue;
    }

    const target = STATUS_FOR_EVENT[event.type];
    // Prefer an application still in play; fall back to a closed one so a
    // second email about an already-rejected role doesn't spawn a duplicate.
    const existing = findMatchingApplication(next, event, { openOnly: true })
      || findMatchingApplication(next, event);

    if (!existing) {
      // An email about an application we never logged is still worth
      // tracking — it counts toward outcomes and response-rate analytics.
      const created = createFromEvent(event, target, makeId, today);
      next = [created, ...next];
      changes.push({ kind: "added", company: event.company, role: event.role, status: target, messageId: event.messageId, appId: created.id });
      continue;
    }

    const alreadyThere = existing.status === target
      || (event.type === "interview" && ["Offer", "Rejected", "Withdrawn"].includes(existing.status))
      || (event.type === "rejected" && ["Offer", "Withdrawn", "Rejected"].includes(existing.status));

    next = next.map((app) => {
      if (app.id !== existing.id) return app;
      const logged = withEmail(app, event);
      if (alreadyThere) return logged;
      const moved = applyStatusTransition(logged, target, eventDate);
      return { ...moved, updatedAt: today, emailUpdated: true };
    });
    if (!alreadyThere) {
      changes.push({ kind: "status", company: existing.company, role: existing.role, from: existing.status, status: target, messageId: event.messageId, appId: existing.id });
    }
  }

  return { apps: next, changes };
}

function createFromEvent(event, status, makeId, today) {
  const dateApplied = event.date || today;
  const base = {
    id: makeId(),
    company: event.company,
    role: event.role || "Role not detected",
    location: event.location || "",
    source: event.source || "",
    dateApplied,
    status: "Applied",
    jobUrl: "",
    hiringManager: "",
    hmLinkedIn: "",
    followUpDate: "",
    notes: `Auto-added from Gmail: "${event.subject}"`,
    interviewStage: status === "Interview" ? "1st Interview" : "",
    followUpStatus: "",
    followUpHistory: [],
    hmAvailable: true,
    hmLinkedInAvailable: true,
    autoGhosted: false,
    fromEmail: true,
    createdAt: dateApplied,
    updatedAt: today,
    statusUpdatedAt: dateApplied,
    emailLog: [emailEntry(event)],
  };
  const normalized = normalizeApplication(base, today);
  return status === "Applied" ? normalized : applyStatusTransition(normalized, status, dateApplied);
}
