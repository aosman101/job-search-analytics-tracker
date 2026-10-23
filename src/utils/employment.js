import { SECURED_STATUS } from "../constants";
import { daysBetween, todayISO } from "./dates";

/**
 * Employment tracking for applications that ended in a secured job.
 *
 * `startDate` is when the job began; `endDate` is when it finished and stays
 * empty while the job is current. Time worked is always derived from those two
 * dates rather than stored, so editing either one keeps analytics honest.
 */

export function isSecured(app) {
  return app.status === SECURED_STATUS;
}

/** "current" (working there now), "finished", "upcoming" (start date ahead) or "unknown" (no start date). */
export function employmentState(app, today = todayISO()) {
  if (!app.startDate) return "unknown";
  if (app.startDate > today) return "upcoming";
  if (app.endDate && app.endDate <= today) return "finished";
  return "current";
}

/** Days worked, counting up to today for a current job. Null when it can't be known yet. */
export function tenureDays(app, today = todayISO()) {
  const state = employmentState(app, today);
  if (state === "unknown" || state === "upcoming") return null;
  const end = state === "finished" ? app.endDate : today;
  const days = daysBetween(app.startDate, end);
  return days >= 0 ? days : null;
}

/** Human-readable duration: "12 days", "4 months", "1 yr 3 mo". */
export function formatTenure(days) {
  if (days === null || days === undefined) return "—";
  if (days < 31) return `${days} day${days !== 1 ? "s" : ""}`;
  const totalMonths = Math.floor(days / 30.4);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} month${months !== 1 ? "s" : ""}`;
  return months === 0 ? `${years} yr${years !== 1 ? "s" : ""}` : `${years} yr${years !== 1 ? "s" : ""} ${months} mo`;
}

/** Validation for the start/end pair; returns an error message or "". */
export function validateEmploymentDates({ startDate, endDate }) {
  if (!startDate) return "Add the date you started the job.";
  if (endDate && endDate < startDate) return "The finish date can't be before the start date.";
  return "";
}

function average(values) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildEmploymentMetrics(apps, today = todayISO()) {
  const secured = apps
    .filter(isSecured)
    .map((app) => ({
      ...app,
      employment: employmentState(app, today),
      tenure: tenureDays(app, today),
      // Applied → secured shows how long a successful search took end to end.
      daysToSecure: app.dateApplied && app.securedAt ? daysBetween(app.dateApplied, app.securedAt) : null,
    }))
    .sort((a, b) => (b.startDate || b.securedAt || "").localeCompare(a.startDate || a.securedAt || ""));

  const finished = secured.filter((app) => app.employment === "finished" && app.tenure !== null);
  const current = secured.filter((app) => app.employment === "current");
  const withTenure = secured.filter((app) => app.tenure !== null);
  const secureDurations = secured.map((app) => app.daysToSecure).filter((value) => typeof value === "number" && value >= 0);

  return {
    secured,
    current,
    finished,
    upcoming: secured.filter((app) => app.employment === "upcoming"),
    missingStart: secured.filter((app) => app.employment === "unknown"),
    // Only completed jobs give a fair average; a current job's tenure is still growing.
    avgTenureDays: average(finished.map((app) => app.tenure)),
    totalTenureDays: withTenure.reduce((sum, app) => sum + app.tenure, 0),
    longestTenure: withTenure.reduce((best, app) => (best === null || app.tenure > best.tenure ? app : best), null),
    avgDaysToSecure: average(secureDurations),
  };
}
