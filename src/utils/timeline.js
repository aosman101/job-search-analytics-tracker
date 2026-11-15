/**
 * A dated history for one application, built from the timestamps the tracker
 * already records, so it works for existing data with no migration.
 */
export function buildTimeline(app) {
  const events = [];
  const add = (date, label, detail = "") => {
    if (typeof date === "string" && date) events.push({ date: date.slice(0, 10), label, detail });
  };

  add(app.dateApplied, "Applied", app.source ? `via ${app.source}` : "");
  for (const entry of Array.isArray(app.followUpHistory) ? app.followUpHistory : []) {
    add(entry.date, `Follow-up: ${entry.outcome || entry.method || "recorded"}`, entry.note || "");
  }
  add(app.reopenedAt, "Reopened");
  add(app.interviewStartedAt, "Interviews started");
  add(app.interviewDate, app.interviewStage || "Interview", "scheduled");
  add(app.offerAt, "Offer received");
  add(app.status === "Job Secured" ? app.startDate : "", "Started the job");
  add(app.status === "Job Secured" ? app.endDate : "", "Finished the job");
  if (app.status === "Rejected") add(app.rejectedAt, "Rejected", app.interviewStage ? `at ${app.interviewStage}` : "");
  if (app.status === "Ghosted") add(app.ghostedAt, app.autoGhosted ? "Marked ghosted automatically" : "Marked ghosted");
  if (app.status === "Withdrawn") add(app.withdrawnAt, "Withdrawn");

  // Stable sort keeps same-day events in the order they were added above.
  return events
    .map((event, index) => ({ ...event, index }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)
    .map(({ index, ...event }) => event);
}
