import { CLOSED_STATUSES, SECURED_STATUS, hasKnownRole, reachedOffer } from "../constants";
import { STAGE_DEPTH, heardBack, reachedInterview } from "./applicationMetrics";
import { addDays, daysBetween, parseLocalDate, todayISO } from "./dates";

// Follow-up methods that mean a message actually reached the employer.
const CONTACT_METHODS = ["LinkedIn message", "Email"];
// A segment needs this many applications before its rate is worth comparing.
export const MIN_SAMPLE = 3;
// Most monthly columns the outcome chart shows before older ones are dropped.
const MAX_BUCKETS = 12;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const RANGES = [
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "all", label: "All time", days: null },
];

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function median(values) {
  return percentile(values, 50);
}

/** Nearest-rank percentile; null when there is nothing to rank. */
export function percentile(values, p) {
  const sorted = values.filter((value) => typeof value === "number" && value >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/** The earliest date the employer answered, or "" if they never have. */
export function firstResponseDate(app) {
  return [app.interviewStartedAt, app.rejectedAt, app.offerAt]
    .filter((value) => typeof value === "string" && value && (!app.dateApplied || value >= app.dateApplied))
    .sort()[0] || "";
}

export function daysToFirstResponse(app) {
  const responded = firstResponseDate(app);
  return app.dateApplied && responded ? daysBetween(app.dateApplied, responded) : null;
}

/** Where an application ended up, collapsed to the four outcomes worth charting. */
export function outcomeOf(app) {
  if (reachedInterview(app) || reachedOffer(app)) return "progressed";
  if (app.status === "Rejected") return "rejected";
  if (app.status === "Ghosted" || app.status === "Withdrawn") return "silent";
  return "open";
}

/** Applications sent inside the range, plus the equally long window before it. */
export function splitByRange(apps, days, today = todayISO()) {
  if (!days) return { current: apps, previous: null };
  const start = addDays(today, -(days - 1));
  const previousStart = addDays(start, -days);
  return {
    current: apps.filter((app) => app.dateApplied >= start && app.dateApplied <= today),
    previous: apps.filter((app) => app.dateApplied >= previousStart && app.dateApplied < start),
  };
}

function buildFunnel(apps) {
  const reachedAtLeast = (depth) => apps.filter((app) => {
    if ((STAGE_DEPTH[app.interviewStage] || 0) >= depth) return true;
    if (reachedOffer(app)) return true;
    return depth <= 1 && reachedInterview(app);
  }).length;
  return [
    { label: "Applied", count: apps.length },
    { label: "1st Interview", count: reachedAtLeast(1) },
    { label: "2nd+ Interview", count: reachedAtLeast(2) },
    { label: "Final Round", count: reachedAtLeast(4) },
    { label: "Offer", count: apps.filter(reachedOffer).length },
    { label: "Secured", count: apps.filter((app) => app.status === SECURED_STATUS).length },
  ];
}

function mondayOf(dateISO) {
  const date = parseLocalDate(dateISO);
  if (!date) return "";
  return addDays(dateISO, -((date.getDay() + 6) % 7));
}

/**
 * Applications grouped by when they were sent, split by how each one turned
 * out. Weekly while the span is short enough to read, monthly beyond that.
 */
function buildCohorts(apps, days, today) {
  const dated = apps.filter((app) => parseLocalDate(app.dateApplied) && app.dateApplied <= today);
  if (dated.length === 0) return { unit: "week", buckets: [], trimmed: false };
  const earliest = dated.reduce((min, app) => (app.dateApplied < min ? app.dateApplied : min), today);
  const start = days ? addDays(today, -(days - 1)) : earliest;
  // Up to about 14 weekly columns stay readable; longer spans go monthly.
  const monthly = daysBetween(start, today) > 100;
  const keyOf = (dateISO) => (monthly ? dateISO.slice(0, 7) : mondayOf(dateISO));

  const keys = [];
  if (monthly) {
    const cursor = parseLocalDate(`${start.slice(0, 7)}-01`);
    const end = today.slice(0, 7);
    while (todayISO(cursor).slice(0, 7) <= end) {
      keys.push(todayISO(cursor).slice(0, 7));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    for (let key = mondayOf(start); key <= today; key = addDays(key, 7)) keys.push(key);
  }

  const buckets = new Map(keys.map((key) => {
    const date = parseLocalDate(monthly ? `${key}-01` : key);
    const label = monthly
      ? date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
      : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return [key, { key, label, progressed: 0, open: 0, rejected: 0, silent: 0, total: 0 }];
  }));
  for (const app of dated) {
    const bucket = buckets.get(keyOf(app.dateApplied));
    if (!bucket) continue;
    bucket[outcomeOf(app)] += 1;
    bucket.total += 1;
  }
  // One stray old application shouldn't squash a year of empty months into view.
  const all = [...buckets.values()];
  const shown = monthly ? all.slice(-MAX_BUCKETS) : all;
  return { unit: monthly ? "month" : "week", buckets: shown, trimmed: shown.length < all.length };
}

const REPLY_BUCKETS = [
  { label: "0–3 days", max: 3 },
  { label: "4–7 days", max: 7 },
  { label: "8–14 days", max: 14 },
  { label: "15–21 days", max: 21 },
  { label: "22+ days", max: Infinity },
];

function buildReplyTiming(apps) {
  const durations = apps.map(daysToFirstResponse).filter((value) => typeof value === "number" && value >= 0);
  let floor = -1;
  const buckets = REPLY_BUCKETS.map((bucket) => {
    const count = durations.filter((value) => value > floor && value <= bucket.max).length;
    floor = bucket.max;
    return { label: bucket.label, count };
  });
  return {
    count: durations.length,
    median: median(durations),
    p80: percentile(durations, 80),
    medianToInterview: median(apps.map((app) => (app.dateApplied && app.interviewStartedAt ? daysBetween(app.dateApplied, app.interviewStartedAt) : null))),
    medianToRejection: median(apps.filter((app) => app.status === "Rejected").map((app) => (app.dateApplied && app.rejectedAt ? daysBetween(app.dateApplied, app.rejectedAt) : null))),
    buckets,
  };
}

/**
 * Does chasing help? Quick replies never need a follow-up, so comparing every
 * application would flatter the ones left alone. This only looks at
 * applications still unanswered a week in, then splits them by whether a
 * follow-up was sent before any reply arrived.
 */
function buildFollowUpEffect(apps, today) {
  const groups = { chased: { total: 0, replied: 0 }, left: { total: 0, replied: 0 } };
  const channels = {};
  for (const app of apps) {
    const sent = (app.followUpHistory || []).filter((entry) => CONTACT_METHODS.includes(entry?.method) && entry.date);
    for (const entry of sent) channels[entry.method] = (channels[entry.method] || 0) + 1;
    if (!app.dateApplied || daysBetween(app.dateApplied, today) < 7) continue;
    const responded = firstResponseDate(app);
    if (responded && daysBetween(app.dateApplied, responded) < 7) continue;
    const firstChase = sent.map((entry) => entry.date).sort()[0];
    const chased = Boolean(firstChase) && (!responded || firstChase <= responded);
    const group = chased ? groups.chased : groups.left;
    group.total += 1;
    if (responded) group.replied += 1;
  }
  return {
    chased: { ...groups.chased, rate: pct(groups.chased.replied, groups.chased.total) },
    left: { ...groups.left, rate: pct(groups.left.replied, groups.left.total) },
    channels: Object.entries(channels).map(([method, count]) => ({ method, count })).sort((a, b) => b.count - a.count),
    sentCount: Object.values(channels).reduce((sum, count) => sum + count, 0),
  };
}

function buildSegment(apps, valueOf, limit = 6) {
  const groups = new Map();
  for (const app of apps) {
    const label = valueOf(app);
    if (!label) continue;
    if (!groups.has(label)) groups.set(label, { label, total: 0, replied: 0, interviews: 0, offers: 0 });
    const group = groups.get(label);
    group.total += 1;
    if (heardBack(app)) group.replied += 1;
    if (reachedInterview(app)) group.interviews += 1;
    if (reachedOffer(app)) group.offers += 1;
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      replyRate: pct(group.replied, group.total),
      interviewRate: pct(group.interviews, group.total),
      lowSample: group.total < MIN_SAMPLE,
    }))
    // Segments with enough data lead, best interview rate first; thin ones trail.
    .sort((a, b) => Number(a.lowSample) - Number(b.lowSample) || b.interviewRate - a.interviewRate || b.total - a.total)
    .slice(0, limit);
}

function buildInsights({ kpis, previous, days, timing, segments, rejections, followUps }) {
  const insights = [];
  if (previous && (kpis.total > 0 || previous.length > 0)) {
    const diff = kpis.total - previous.length;
    insights.push({
      tone: diff >= 0 ? "success" : "warning",
      title: diff === 0 ? "Pace is steady" : diff > 0 ? "Pace is up" : "Pace is down",
      detail: `${kpis.total} application${kpis.total !== 1 ? "s" : ""} in the last ${days} days, against ${previous.length} in the ${days} days before.`,
    });
  }
  if (timing.count >= 5) {
    insights.push({
      tone: "followup",
      title: `Most replies land within ${timing.p80} day${timing.p80 !== 1 ? "s" : ""}`,
      detail: `Half arrive within ${timing.median} day${timing.median !== 1 ? "s" : ""}. Past day ${timing.p80} a reply is unlikely, so chase it or let it go.`,
    });
  }
  const best = [...segments.source, ...segments.role]
    .filter((item) => item.total >= 5 && item.interviewRate > kpis.interviewRate)
    .sort((a, b) => b.interviewRate - a.interviewRate)[0];
  if (best) {
    insights.push({
      tone: "interview",
      title: `${best.label} is your strongest bet`,
      detail: `${best.interviews} of ${best.total} reached an interview (${best.interviewRate}%), against ${kpis.interviewRate}% overall.`,
    });
  }
  if (rejections.total >= 5) {
    const early = pct(rejections.beforeInterview, rejections.total);
    insights.push(early >= 60
      ? { tone: "risk", title: "Rejections come before the interview", detail: `${early}% of rejections arrive with no interview, which points at CV fit and role targeting rather than interview skill.` }
      : { tone: "risk", title: "Rejections come after interviews", detail: `${100 - early}% of rejections follow at least one interview, so interview prep is the bigger lever.` });
  }
  if (followUps.chased.total >= 5 && followUps.left.total >= 5) {
    const helps = followUps.chased.rate > followUps.left.rate;
    insights.push({
      tone: helps ? "success" : "neutral",
      title: helps ? "Following up is paying off" : "Following up isn't moving replies yet",
      detail: `After a week of silence, ${followUps.chased.rate}% of chased applications got a reply, against ${followUps.left.rate}% of those left alone.`,
    });
  }
  return insights.slice(0, 4);
}

export function buildAnalytics(apps, { today = todayISO(), days = null } = {}) {
  const { current, previous } = splitByRange(apps, days, today);
  const replied = current.filter(heardBack).length;
  const interviews = current.filter(reachedInterview).length;
  const offers = current.filter(reachedOffer).length;
  const ghosted = current.filter((app) => app.status === "Ghosted").length;
  const timing = buildReplyTiming(current);
  const kpis = {
    total: current.length,
    previousTotal: previous ? previous.length : null,
    replied,
    replyRate: pct(replied, current.length),
    interviews,
    interviewRate: pct(interviews, current.length),
    offers,
    offerRate: pct(offers, current.length),
    ghosted,
    ghostRate: pct(ghosted, current.length),
    medianReplyDays: timing.median,
  };

  const rejected = current.filter((app) => app.status === "Rejected");
  const byStage = rejected.reduce((acc, app) => {
    const stage = app.interviewStage || "No Interview";
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});
  const rejections = {
    total: rejected.length,
    beforeInterview: byStage["No Interview"] || 0,
    stages: ["No Interview", ...Object.keys(STAGE_DEPTH).filter(Boolean)]
      .map((stage) => ({ stage, count: byStage[stage] || 0, pct: pct(byStage[stage] || 0, rejected.length) }))
      .filter((item) => item.count > 0),
  };

  const segments = {
    source: buildSegment(current, (app) => app.source?.trim()),
    role: buildSegment(current, (app) => (hasKnownRole(app) ? app.role.trim() : "")),
    location: buildSegment(current, (app) => app.location?.trim()),
    weekday: buildSegment(current, (app) => {
      const date = parseLocalDate(app.dateApplied);
      return date ? WEEKDAYS[date.getDay()] : "";
    }, 7),
  };
  const followUps = buildFollowUpEffect(current, today);

  // Open-application age is a statement about right now, so it ignores the range.
  const open = apps.filter((app) => !CLOSED_STATUSES.includes(app.status));
  const ageOf = (app) => daysBetween(app.dateApplied, today);
  const aging = [
    { label: "0–7 days", tone: "fresh", count: open.filter((app) => ageOf(app) <= 7).length },
    { label: "8–14 days", tone: "ok", count: open.filter((app) => ageOf(app) > 7 && ageOf(app) <= 14).length },
    { label: "15–21 days", tone: "ageing", count: open.filter((app) => ageOf(app) > 14 && ageOf(app) <= 21).length },
    { label: "22+ days", tone: "stale", count: open.filter((app) => ageOf(app) > 21).length },
  ].map((bucket) => ({ ...bucket, pct: pct(bucket.count, open.length) }));

  return {
    apps: current,
    kpis,
    funnel: buildFunnel(current),
    cohorts: buildCohorts(current, days, today),
    timing,
    rejections,
    segments,
    followUps,
    aging,
    openCount: open.length,
    insights: buildInsights({ kpis, previous, days, timing, segments, rejections, followUps }),
  };
}
