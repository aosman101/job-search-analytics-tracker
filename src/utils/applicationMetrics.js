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

function average(values) {
  const numeric = values.filter((value) => typeof value === "number" && value >= 0);
  if (numeric.length === 0) return null;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function rankWithOutcomes(apps, key, limit = 5) {
  return Object.entries(apps.reduce((acc, app) => {
    const value = app[key]?.trim();
    if (!value) return acc;
    if (!acc[value]) {
      acc[value] = { label: value, total: 0, responses: 0, interviews: 0, offers: 0, active: 0 };
    }
    acc[value].total += 1;
    if (!["Applied", "Ghosted"].includes(app.status)) acc[value].responses += 1;
    if (reachedInterview(app)) acc[value].interviews += 1;
    if (app.status === "Offer") acc[value].offers += 1;
    if (!["Rejected", "Withdrawn", "Ghosted", "Offer"].includes(app.status)) acc[value].active += 1;
    return acc;
  }, {}))
    .map(([, item]) => ({
      ...item,
      responseRate: Math.round((item.responses / item.total) * 100),
      interviewRate: Math.round((item.interviews / item.total) * 100),
    }))
    .sort((a, b) => b.total - a.total || b.interviewRate - a.interviewRate)
    .slice(0, limit);
}

export function buildTrackerMetrics(apps, options = {}) {
  const now = options.now || new Date();
  const today = options.today || todayISO(now);
  const sorted = [...apps].sort((a, b) => (b.dateApplied || "").localeCompare(a.dateApplied || ""));
  const closedStatuses = ["Rejected", "Withdrawn", "Offer", "Ghosted"];
  const openApps = apps.filter((app) => !closedStatuses.includes(app.status));
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
  const interviewDurations = apps
    .map((app) => {
      if (!app.dateApplied || !app.interviewStartedAt) return null;
      return daysBetween(app.dateApplied, app.interviewStartedAt);
    })
    .filter((value) => typeof value === "number" && value >= 0);
  const openDurations = openApps
    .map((app) => daysSince(app.dateApplied, now))
    .filter((value) => typeof value === "number" && value >= 0);

  const byMonth = apps.reduce((acc, app) => {
    const month = app.dateApplied?.slice(0, 7) || "Unknown";
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});
  const last28 = Array.from({ length: 4 }, (_, index) => {
    const end = new Date(now);
    end.setDate(end.getDate() - (3 - index) * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const startISO = todayISO(start);
    const endISO = todayISO(end);
    return {
      week: `${start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`,
      applied: apps.filter((app) => app.dateApplied >= startISO && app.dateApplied <= endISO).length,
      responses: apps.filter((app) => {
        const statusDate = app.statusUpdatedAt || app.updatedAt || "";
        return statusDate >= startISO && statusDate <= endISO && !["Applied", "Ghosted"].includes(app.status);
      }).length,
    };
  });
  const atRiskApps = sorted.filter((app) => {
    const remaining = daysUntilGhost(app, now);
    return remaining !== null && remaining > 0 && remaining <= 7;
  }).slice(0, 6);
  const staleApps = sorted
    .filter((app) => openApps.includes(app))
    .filter((app) => daysSince(app.updatedAt || app.statusUpdatedAt || app.dateApplied, now) >= 10)
    .slice(0, 8);
  const unscheduledFollowUps = sorted
    .filter((app) => ["Applied", "Follow-Up"].includes(app.status))
    .filter((app) => !app.followUpDate && daysSince(app.dateApplied, now) >= 5)
    .slice(0, 8);
  const stalledInterviews = sorted
    .filter((app) => !closedStatuses.includes(app.status) && (app.status === "Interview" || app.interviewStage))
    .filter((app) => daysSince(app.updatedAt || app.statusUpdatedAt || app.interviewStartedAt || app.dateApplied, now) >= 7)
    .slice(0, 8);
  const freshThisWeek = apps.filter((app) => isWithinPastDays(app.dateApplied, 7, now)).length;
  const pipelineScore = Math.max(
    0,
    Math.min(
      100,
      78
        + Math.min(12, freshThisWeek * 3)
        + Math.min(10, apps.filter(reachedInterview).length * 2)
        - Math.min(24, dueFollowUps.length * 4)
        - Math.min(18, atRiskApps.length * 3)
        - Math.min(14, unscheduledFollowUps.length * 2),
    ),
  );

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
    last28,
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
      average(rejectionDurations),
    avgDaysToInterview: average(interviewDurations),
    avgOpenAge: average(openDurations),
    atRiskApps,
    staleApps,
    unscheduledFollowUps,
    stalledInterviews,
    roleOutcomes: rankWithOutcomes(apps, "role"),
    locationOutcomes: rankWithOutcomes(apps, "location"),
    freshThisWeek,
    pipelineScore,
    nextActions: [
      dueFollowUps.length > 0 && {
        tone: "warning",
        label: "Clear due follow-ups",
        detail: `${dueFollowUps.length} follow-up${dueFollowUps.length !== 1 ? "s" : ""} need a response today.`,
      },
      stalledInterviews.length > 0 && {
        tone: "interview",
        label: "Refresh interview items",
        detail: `${stalledInterviews.length} interview-stage role${stalledInterviews.length !== 1 ? "s" : ""} have not been updated recently.`,
      },
      unscheduledFollowUps.length > 0 && {
        tone: "followup",
        label: "Schedule missing follow-ups",
        detail: `${unscheduledFollowUps.length} open application${unscheduledFollowUps.length !== 1 ? "s" : ""} have no follow-up date.`,
      },
      atRiskApps.length > 0 && {
        tone: "risk",
        label: "Review ghost risk",
        detail: `${atRiskApps.length} application${atRiskApps.length !== 1 ? "s are" : " is"} close to ghosting.`,
      },
      freshThisWeek === 0 && {
        tone: "neutral",
        label: "Add fresh applications",
        detail: "No new applications have been logged in the last 7 days.",
      },
    ].filter(Boolean),
  };
}
