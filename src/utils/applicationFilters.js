import { CLOSED_STATUSES } from "../constants";
import { daysUntilGhost } from "./applicationMetrics";
import { todayISO } from "./dates";

const SEARCHABLE_FIELDS = ["company", "role", "location", "source"];

// An application needs attention when a follow-up has come due without being
// actioned, or when it is within a week of being auto-ghosted.
export function needsAttention(app, today = todayISO()) {
  if (CLOSED_STATUSES.includes(app.status)) return false;

  const followUpOverdue = Boolean(app.followUpDate) && app.followUpDate <= today && !app.followUpStatus;
  if (followUpOverdue) return true;

  const remaining = daysUntilGhost(app, new Date(today));
  return remaining !== null && remaining > 0 && remaining <= 7;
}

export function filterApplications(apps, filters = {}, today = todayISO()) {
  const { status = "All", source = "All", search = "", needsAttention: onlyAttention = false } = filters;
  const term = search.trim().toLowerCase();

  return apps.filter((app) => {
    if (status !== "All" && app.status !== status) return false;
    if (source !== "All" && (app.source || "") !== source) return false;
    if (onlyAttention && !needsAttention(app, today)) return false;
    if (!term) return true;
    return SEARCHABLE_FIELDS.some((field) => (app[field] || "").toLowerCase().includes(term));
  });
}

export function sortApplications(apps, sortBy) {
  const copy = [...apps];
  if (sortBy === "date") return copy.sort((a, b) => (b.dateApplied || "").localeCompare(a.dateApplied || ""));
  if (sortBy === "company") return copy.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
  if (sortBy === "status") return copy.sort((a, b) => (a.status || "").localeCompare(b.status || ""));
  return copy;
}
