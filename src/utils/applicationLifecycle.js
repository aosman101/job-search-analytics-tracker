import { CLOSED_STATUSES, GHOST_DAYS } from "../constants";
import { daysSince, todayISO } from "./dates";

function timestampForExistingStatus(app) {
  return app.statusUpdatedAt || app.updatedAt || app.createdAt || app.dateApplied || todayISO();
}

export function normalizeApplication(app, nowISO = todayISO()) {
  const createdAt = app.createdAt || app.dateApplied || nowISO;
  const statusUpdatedAt = app.statusUpdatedAt || createdAt;
  const normalized = {
    ...app,
    createdAt,
    updatedAt: app.updatedAt || statusUpdatedAt,
    statusUpdatedAt,
    followUpHistory: Array.isArray(app.followUpHistory) ? app.followUpHistory : [],
  };

  const statusDate = timestampForExistingStatus(normalized);
  if (normalized.status === "Interview" && !normalized.interviewStartedAt) {
    normalized.interviewStartedAt = statusDate;
  }
  if (normalized.interviewStage && !normalized.interviewStartedAt) {
    normalized.interviewStartedAt = statusDate;
  }
  if (normalized.status === "Offer" && !normalized.offerAt) {
    normalized.offerAt = statusDate;
  }
  if (normalized.status === "Rejected" && !normalized.rejectedAt) {
    normalized.rejectedAt = statusDate;
  }
  if (normalized.status === "Ghosted" && !normalized.ghostedAt) {
    normalized.ghostedAt = statusDate;
  }
  if (normalized.status === "Withdrawn" && !normalized.withdrawnAt) {
    normalized.withdrawnAt = statusDate;
  }

  return normalized;
}

export function normalizeApplications(apps, nowISO = todayISO()) {
  return apps.map((app) => normalizeApplication(app, nowISO));
}

export function applyStatusTransition(app, nextStatus, nowISO = todayISO()) {
  const previousStatus = app.status;
  const next = {
    ...app,
    status: nextStatus,
    autoGhosted: false,
    updatedAt: nowISO,
  };

  if (previousStatus !== nextStatus) {
    next.statusUpdatedAt = nowISO;
  }
  if (nextStatus === "Interview" && !next.interviewStartedAt) {
    next.interviewStartedAt = nowISO;
  }
  if (nextStatus === "Offer") {
    next.offerAt = next.offerAt || nowISO;
  }
  if (nextStatus === "Rejected") {
    next.rejectedAt = next.rejectedAt || nowISO;
  }
  if (nextStatus === "Ghosted") {
    next.ghostedAt = next.ghostedAt || nowISO;
  }
  if (nextStatus === "Withdrawn") {
    next.withdrawnAt = next.withdrawnAt || nowISO;
  }

  return next;
}

export function autoGhost(apps, nowISO = todayISO()) {
  return apps.map((app) => {
    if (!["Applied", "Follow-Up"].includes(app.status) || daysSince(app.dateApplied) < GHOST_DAYS) {
      return app;
    }
    return {
      ...app,
      status: "Ghosted",
      autoGhosted: true,
      ghostedAt: app.ghostedAt || nowISO,
      statusUpdatedAt: nowISO,
      updatedAt: nowISO,
    };
  });
}

export function findNewlyGhosted(before, after) {
  const beforeMap = new Map(before.map((app) => [app.id, app.status]));
  return after.filter((app) => app.status === "Ghosted" && beforeMap.get(app.id) !== "Ghosted");
}

export function isOpenForFollowUp(app) {
  return !CLOSED_STATUSES.includes(app.status);
}
