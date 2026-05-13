import { GHOST_DAYS, STATUS_CONFIG } from "../constants";
import { daysBetween, daysSince, isWeekend, isWithinPastDays, todayISO } from "./dates";

export const STAGE_DEPTH = {
  "": 0,
  "1st Interview": 1,
  "2nd Interview": 2,
  "3rd Interview": 3,
  "Home Assignment": 4,
  "Final Interview": 5,
};

export function reachedInterview(app) {
  return ["Interview", "Offer"].includes(app.status) || Boolean(app.interviewStage) || Boolean(app.interviewStartedAt);
}

export function daysUntilGhost(app, now = new Date()) {
  if (!["Applied", "Follow-Up"].includes(app.status)) return null;
  return Math.max(0, GHOST_DAYS - daysSince(app.dateApplied, now));
}

export function buildTrackerMetrics(apps, options = {}) {
  const now = options.now || new Date();
  const today = options.today || todayISO(now);
  const sorted = [...apps].sort((a, b) => (b.dateApplied || "").localeCompare(a.dateApplied || ""));
  const dueFollowUps = apps.filter(
    (app) =>
      app.followUpDate &&
      app.followUpDate <= today &&
      !["Rejected", "Withdrawn", "Offer", "Ghosted"].includes(app.status) &&
      !app.followUpStatus,
  );
  const rejectedApps = apps.filter((app) => app.status === "Rejected");
  const rejectionsByStage = rejectedApps.reduce((acc, app) => {
    const key = app.interviewStage || "No Interview";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const rejectionDurations = rejectedApps
    .map((app) => {
      if (!app.dateApplied || !app.rejectedAt) return null;
      return daysBetween(app.dateApplied, app.rejectedAt);
    })
    .filter((value) => typeof value === "number" && value >= 0);

  const byMonth = apps.reduce((acc, app) => {
    const month = app.dateApplied?.slice(0, 7) || "Unknown";
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});

  return {
    today,
    sorted,
    dueFollowUps,
    statusCounts: Object.keys(STATUS_CONFIG)
      .map((name) => ({ name, value: apps.filter((app) => app.status === name).length, color: STATUS_CONFIG[name].color }))
      .filter((item) => item.value > 0),
    monthData: Object.entries(byMonth).sort().map(([month, count]) => ({ month: `${month.slice(5)}/${month.slice(2, 4)}`, count })),
    last7: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(date.getDate() - (6 - index));
      const dateString = todayISO(date);
      return {
        day: date.toLocaleDateString("en-GB", { weekday: "short" }),
        count: apps.filter((app) => app.dateApplied === dateString).length,
        weekend: isWeekend(date),
      };
    }),
    todayCount: apps.filter((app) => app.dateApplied === today).length,
    responseRate: apps.length > 0 ? Math.round((apps.filter((app) => !["Applied", "Ghosted"].includes(app.status)).length / apps.length) * 100) : 0,
    interviewRate: apps.length > 0 ? Math.round((apps.filter(reachedInterview).length / apps.length) * 100) : 0,
    offerRate: apps.length > 0 ? Math.round((apps.filter((app) => app.status === "Offer").length / apps.length) * 100) : 0,
    ghostRate: apps.length > 0 ? Math.round((apps.filter((app) => app.status === "Ghosted").length / apps.length) * 100) : 0,
    activeApplications: apps.filter((app) => !["Rejected", "Ghosted", "Withdrawn"].includes(app.status)).length,
    interviewQueue: sorted
      .filter((app) => !["Rejected", "Withdrawn", "Ghosted"].includes(app.status) && (app.status === "Interview" || app.status === "Offer" || app.interviewStage))
      .slice(0, 6),
    rejectedApps,
    rejectionsByStage,
    everInterviewedCount: apps.filter(reachedInterview).length,
    avgDaysToRejection:
      rejectionDurations.length > 0
        ? Math.round(rejectionDurations.reduce((sum, value) => sum + value, 0) / rejectionDurations.length)
        : null,
    atRiskApps: sorted.filter((app) => {
      const remaining = daysUntilGhost(app, now);
      return remaining !== null && remaining > 0 && remaining <= 7;
    }).slice(0, 6),
    freshThisWeek: apps.filter((app) => isWithinPastDays(app.dateApplied, 7, now)).length,
  };
}
