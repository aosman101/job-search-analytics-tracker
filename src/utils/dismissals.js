import { daysBetween } from "./dates";

export const DISMISSALS_STORAGE_KEY = "adil-job-tracker-dismissed";
// Keys embed the dates that triggered them, so old ones can never match
// again; this only stops the stored map growing forever.
const RETENTION_DAYS = 60;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Identifies one pipeline reminder. Each key includes the fields that put the
 * application in that group, so a dismissal holds only while nothing changes:
 * rescheduling a follow-up, moving an interview, or logging a new message
 * brings the reminder back.
 */
export function dismissKey(group, app, extra = "") {
  const lastContact = app.followUpHistory?.[0]?.date || "";
  const signature = {
    due: [app.followUpDate],
    interviews: [app.status, app.interviewStage, app.interviewDate],
    risk: [app.dateApplied, lastContact],
    unplanned: [app.dateApplied, app.followUpDate],
    week: [extra],
  }[group] ?? [extra];
  return [group, app.id, ...signature.map((part) => part ?? "")].join("|");
}

/** The "follow-ups due" banner returns the next day, or as soon as another one falls due. */
export function dueBannerKey(dueApps, today) {
  const ids = dueApps.map((app) => String(app.id)).sort();
  return ["banner-due", today, ...ids].join("|");
}

/** Reads the stored { key: dismissedOnISO } map, tolerating missing or corrupt data. */
export function parseDismissals(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, date]) => typeof date === "string" && ISO_DATE.test(date)));
  } catch {
    return {};
  }
}

export function pruneDismissals(map, today) {
  return Object.fromEntries(Object.entries(map).filter(([, date]) => daysBetween(date, today) <= RETENTION_DAYS));
}
