import { useState } from "react";
import { X } from "lucide-react";
import { FOLLOWUP_STATUS, GHOST_DAYS, STATUS_CONFIG } from "../../constants";
import { daysUntilGhost } from "../../utils/applicationMetrics";
import { addDays, daysBetween, formatDate, relativeDay } from "../../utils/dates";
import { dismissKey } from "../../utils/dismissals";

const OPEN_STAGES = ["Applied", "Follow-Up", "Interview", "Offer"];
// Rows shown per group in the combined view before "Show all" takes over.
const PREVIEW_ROWS = 6;

function Row({ app, detail, tone, onOpen, onDismiss, children }) {
  return (
    <li className="pipe-row" data-tone={tone}>
      <button type="button" className="pipe-row__ident" onClick={() => onOpen(app.id)} title={`Open ${app.company}`}>
        <span className="pipe-row__name">{app.company}</span>
        <span className="pipe-row__detail">{app.role}{detail ? <> · <span className="pipe-row__when">{detail}</span></> : null}</span>
      </button>
      <div className="pipe-row__actions">
        {children}
        <button
          type="button"
          className="pipe-row__dismiss"
          aria-label={`Dismiss ${app.company} reminder`}
          title="Dismiss. It comes back if anything about it changes."
          onClick={onDismiss}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/**
 * The pipeline as one work queue: a strip of open stages, then every action
 * that needs taking, grouped and filterable, one line per application.
 */
export default function PipelineView({ apps, metrics, today, isDismissed, onDismiss, onRestore, onFollowUp, onSchedule, onOpen, onSecured, onPrep, onShowStatus }) {
  const [filter, setFilter] = useState("all");

  // Dismissed reminders are set aside here; their keys are kept so they can be restored.
  const setAside = [];
  const withoutDismissed = (items, keyOf) => items.filter((item) => {
    const key = keyOf(item);
    if (!isDismissed(key)) return true;
    setAside.push(key);
    return false;
  });
  const weekKey = ({ app, date, kind }) => dismissKey("week", app, `${kind}|${date}`);
  const dismissRow = (key, app) => () => onDismiss([key], app.company);

  const weekEnd = addDays(today, 7);
  const due = withoutDismissed([...metrics.dueFollowUps], (app) => dismissKey("due", app)).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  const risk = withoutDismissed([...metrics.atRiskApps], (app) => dismissKey("risk", app)).sort((a, b) => daysUntilGhost(a) - daysUntilGhost(b));
  const unplanned = withoutDismissed(metrics.unscheduledFollowUps, (app) => dismissKey("unplanned", app));
  const interviews = withoutDismissed(metrics.interviewQueue, (app) => dismissKey("interviews", app));
  const agenda = withoutDismissed([
    ...metrics.upcomingInterviews.filter((app) => app.interviewDate <= weekEnd).map((app) => ({ app, date: app.interviewDate, kind: "Interview" })),
    ...metrics.upcomingFollowUps.map((app) => ({ app, date: app.followUpDate, kind: "Follow-up" })),
  ], weekKey).sort((a, b) => a.date.localeCompare(b.date));

  const overdueLabel = (app) => {
    const late = daysBetween(app.followUpDate, today);
    return late === 0 ? "due today" : `${late} day${late !== 1 ? "s" : ""} overdue`;
  };

  const groups = [
    {
      id: "due",
      label: "Follow-ups due",
      hint: "Most overdue first. Logging one books the next reminder a week out.",
      items: due,
      render: (app) => (
        <Row key={app.id} app={app} tone={app.followUpDate < today ? "late" : undefined} detail={overdueLabel(app)} onOpen={onOpen} onDismiss={dismissRow(dismissKey("due", app), app)}>
          {app.hmLinkedIn && <a href={app.hmLinkedIn} target="_blank" rel="noreferrer" className="chip-button chip-button--accent">LinkedIn ↗</a>}
          <button type="button" className="chip-button chip-button--success" onClick={() => onFollowUp(app.id, "messaged")}><span aria-hidden="true">✅</span> Messaged</button>
          <button type="button" className="chip-button chip-button--accent" onClick={() => onFollowUp(app.id, "email_instead")}><span aria-hidden="true">📧</span> Emailed</button>
          <select
            className="chip-select"
            aria-label={`Couldn't follow up with ${app.company}`}
            value=""
            onChange={(event) => { if (event.target.value) onFollowUp(app.id, event.target.value); }}
          >
            <option value="">Couldn't…</option>
            <option value="premium">{FOLLOWUP_STATUS.premium.label}</option>
            <option value="no_linkedin">{FOLLOWUP_STATUS.no_linkedin.label}</option>
          </select>
          <button type="button" className="chip-button" title="Not ready to chase yet? Move this reminder three days out." onClick={() => onSchedule([app.id], 3, `${app.company} follow-up snoozed for 3 days`)}>
            <span aria-hidden="true">💤</span> 3d
          </button>
        </Row>
      ),
    },
    {
      id: "interviews",
      label: "Interviews & offers",
      hint: "Dated interviews first, soonest at the top.",
      items: interviews,
      render: (app) => {
        const upcoming = app.interviewDate && app.interviewDate >= today;
        const detail = [
          app.interviewStage,
          upcoming ? `${formatDate(app.interviewDate)} (${relativeDay(app.interviewDate, today)})` : app.status === "Interview" ? "no date set" : "",
        ].filter(Boolean).join(" · ");
        return (
          <Row key={app.id} app={app} tone={upcoming ? "interview" : undefined} detail={detail} onOpen={onOpen} onDismiss={dismissRow(dismissKey("interviews", app), app)}>
            <span className="status-badge" data-status={app.status}><span aria-hidden="true">{STATUS_CONFIG[app.status]?.emoji}</span> {app.status.toUpperCase()}</span>
            {app.status === "Offer"
              ? <button type="button" className="chip-button chip-button--secured" onClick={() => onSecured(app.id)}><span aria-hidden="true">🏆</span> Accepted</button>
              : <button type="button" className="chip-button chip-button--violet" onClick={onPrep}>Prep</button>}
          </Row>
        );
      },
    },
    {
      id: "risk",
      label: "Ghost risk",
      hint: `Auto-marked Ghosted after ${GHOST_DAYS} days of silence. A sent message restarts the clock.`,
      items: risk,
      render: (app) => {
        const left = daysUntilGhost(app);
        return (
          <Row key={app.id} app={app} tone="risk" detail={`${left} day${left !== 1 ? "s" : ""} left`} onOpen={onOpen} onDismiss={dismissRow(dismissKey("risk", app), app)}>
            <button type="button" className="chip-button chip-button--success" onClick={() => onFollowUp(app.id, "messaged")}><span aria-hidden="true">✅</span> Messaged</button>
            <button type="button" className="chip-button chip-button--accent" onClick={() => onFollowUp(app.id, "email_instead")}><span aria-hidden="true">📧</span> Emailed</button>
          </Row>
        );
      },
    },
    {
      id: "unplanned",
      label: "No reminder set",
      hint: "Applied five or more days ago with no follow-up planned.",
      items: unplanned,
      action: unplanned.length > 1 && (
        <button
          type="button"
          className="chip-button chip-button--accent"
          onClick={() => onSchedule(unplanned.map((app) => app.id), 2, `Follow-ups set for ${formatDate(addDays(today, 2))} on ${unplanned.length} applications`)}
        >
          Remind me on all {unplanned.length} in 2 days
        </button>
      ),
      render: (app) => (
        <Row key={app.id} app={app} detail={`applied ${relativeDay(app.dateApplied, today)}`} onOpen={onOpen} onDismiss={dismissRow(dismissKey("unplanned", app), app)}>
          <button type="button" className="chip-button chip-button--accent" onClick={() => onSchedule([app.id], 2, `Follow-up for ${app.company} set for ${formatDate(addDays(today, 2))}`)}>Remind in 2 days</button>
        </Row>
      ),
    },
    {
      id: "week",
      label: "Next 7 days",
      hint: "Interviews and follow-ups already on the calendar.",
      items: agenda,
      render: (item) => {
        const { app, date, kind } = item;
        return (
          <Row key={`${kind}-${app.id}`} app={app} tone={kind === "Interview" ? "interview" : undefined} detail={`${kind} ${relativeDay(date, today)} · ${formatDate(date)}`} onOpen={onOpen} onDismiss={dismissRow(weekKey(item), app)} />
        );
      },
    },
  ];

  const active = groups.find((group) => group.id === filter && group.items.length > 0) ? filter : "all";
  const visible = groups.filter((group) => group.items.length > 0 && (active === "all" || group.id === active));
  const stageCounts = OPEN_STAGES.map((status) => ({ status, count: apps.filter((app) => app.status === status).length }));
  const openTotal = stageCounts.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <>
      <div className="pipe-stages" role="group" aria-label="Open applications by stage">
        {stageCounts.map((stage) => (
          <button
            key={stage.status}
            type="button"
            className="pipe-stage"
            data-status={stage.status}
            title={`Show ${stage.status} applications in Job Search`}
            aria-label={`${stage.status}: ${stage.count} application${stage.count !== 1 ? "s" : ""}. Show in Job Search.`}
            onClick={() => onShowStatus(stage.status)}
          >
            <span className="pipe-stage__count">{stage.count}</span>
            <span className="pipe-stage__label"><span aria-hidden="true">{STATUS_CONFIG[stage.status].emoji} </span>{stage.status}</span>
            <span className="pipe-stage__bar" aria-hidden="true"><span style={{ width: `${openTotal > 0 ? (stage.count / openTotal) * 100 : 0}%` }} /></span>
          </button>
        ))}
      </div>

      <section className="section-card">
        <div className="segmented segmented--wrap" role="group" aria-label="Filter the queue">
          <button type="button" className="segmented__option" aria-pressed={active === "all"} onClick={() => setFilter("all")}>All</button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className="segmented__option"
              aria-pressed={active === group.id}
              disabled={group.items.length === 0}
              onClick={() => setFilter(group.id)}
            >
              {group.label} <span className="segmented__count">{group.items.length}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="muted-note pipe-clear">Pipeline is clear. Nothing is due, at risk, or scheduled this week.</p>
        ) : visible.map((group) => {
          const rows = active === "all" ? group.items.slice(0, PREVIEW_ROWS) : group.items;
          const hidden = group.items.length - rows.length;
          return (
            <div key={group.id} className="pipe-group">
              <div className="pipe-group__head">
                <h3 className="pipe-group__title">{group.label} <span className="pipe-group__count">{group.items.length}</span></h3>
                <span className="pipe-group__hint">{group.hint}</span>
                {group.action}
              </div>
              <ul className="pipe-list">{rows.map(group.render)}</ul>
              {hidden > 0 && (
                <button type="button" className="pipe-more" onClick={() => setFilter(group.id)}>Show all {group.items.length}</button>
              )}
            </div>
          );
        })}

        {setAside.length > 0 && (
          <button type="button" className="pipe-more pipe-restore" onClick={() => onRestore(setAside)}>
            Restore {setAside.length} dismissed
          </button>
        )}
      </section>
    </>
  );
}
