import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GHOST_DAYS, STATUS_CONFIG } from "../../constants";
import { STAGE_DEPTH, buildTrackerMetrics } from "../../utils/applicationMetrics";
import { daysSince } from "../../utils/dates";
import { useChartTokens } from "../../useChartTokens";

function SectionCard({ title, subtitle, actions = null, children, className = "" }) {
  return (
    <section className={`section-card ${className}`.trim()}>
      {(title || subtitle || actions) && (
        <div className="section-card__header">
          <div>
            {title && <h3 className="section-card__title">{title}</h3>}
            {subtitle && <p className="section-card__subtitle">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Shared Recharts tooltip styling so every chart matches the active theme. */
function tooltipProps(t) {
  return {
    contentStyle: {
      background: t["--chart-tooltip-bg"],
      border: `1px solid ${t["--chart-tooltip-border"]}`,
      borderRadius: 8,
      color: t["--ink"],
      fontSize: 12,
    },
    labelStyle: { color: t["--muted"], fontWeight: 700 },
    itemStyle: { color: t["--ink"] },
    cursor: { fill: t["--chart-track"] },
  };
}

function axisProps(t) {
  return { tick: { fontSize: 11, fill: t["--chart-label"] }, stroke: t["--chart-axis"] };
}

/**
 * Funnel stages are ordinal — reordering them would change their meaning — so
 * they take a single-hue ramp that darkens with depth rather than a rotating
 * set of hues. The previous rainbow spent the identity channel re-encoding a
 * sequence the bar heights already show, and left the stage order unreadable
 * to anyone who couldn't separate the hues.
 */
function SankeyFunnel({ apps, tokens }) {
  const reachedAtLeast = (depth) => apps.filter((app) => {
    const ownDepth = STAGE_DEPTH[app.interviewStage] || 0;
    if (ownDepth >= depth) return true;
    if (app.status === "Offer" && depth <= 5) return true;
    if (app.status === "Interview" && depth <= 1) return true;
    return false;
  }).length;
  const stages = [
    { label: "Applied", count: apps.length, color: tokens["--funnel-1"] },
    { label: "1st Interview", count: reachedAtLeast(1), color: tokens["--funnel-2"] },
    { label: "2nd+ Interview", count: reachedAtLeast(2), color: tokens["--funnel-3"] },
    { label: "Final Round", count: reachedAtLeast(4), color: tokens["--funnel-4"] },
    { label: "Offer", count: apps.filter((app) => app.status === "Offer").length, color: tokens["--funnel-5"] },
  ];
  const maxCount = stages[0].count || 1;
  const width = 600;
  const height = 220;
  const padX = 60;
  const barWidth = 60;
  const gap = (width - padX * 2 - barWidth * stages.length) / (stages.length - 1);
  return (
    <div className="funnel-scroll">
      <svg
        viewBox={`0 0 ${width} ${height + 60}`}
        className="funnel-svg"
        role="img"
        aria-label={`Application funnel: ${stages.map((s) => `${s.label} ${s.count}`).join(", ")}`}
      >
        {stages.map((stage, index) => {
          const x = padX + index * (barWidth + gap);
          const barHeight = Math.max(8, (stage.count / maxCount) * (height - 40));
          const y = (height - barHeight) / 2 + 10;
          const next = stages[index + 1];
          const conversion = next && stage.count > 0 ? Math.round((next.count / stage.count) * 100) : null;
          return (
            <g key={stage.label}>
              {next && (() => {
                const nx = x + barWidth + gap;
                const nextHeight = Math.max(8, (next.count / maxCount) * (height - 40));
                const ny = (height - nextHeight) / 2 + 10;
                const midX = (x + barWidth + nx) / 2;
                return (
                  <>
                    <path d={`M ${x + barWidth} ${y} C ${midX} ${y}, ${midX} ${ny}, ${nx} ${ny} L ${nx} ${ny + nextHeight} C ${midX} ${ny + nextHeight}, ${midX} ${y + barHeight}, ${x + barWidth} ${y + barHeight} Z`} fill={stage.color} fillOpacity={0.15} />
                    {conversion !== null && (
                      <text x={midX} y={(y + barHeight / 2 + ny + nextHeight / 2) / 2} textAnchor="middle" fontSize={10} fontWeight={700} fill={tokens["--chart-label"]}>{conversion}%</text>
                    )}
                  </>
                );
              })()}
              <rect x={x} y={y} width={barWidth} height={barHeight} rx={4} fill={stage.color} />
              {/* Counts and labels wear text tokens, not the series colour, so
                  they stay legible against both surfaces. */}
              <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fontSize={15} fontWeight={800} fill={tokens["--ink"]}>{stage.count}</text>
              <text x={x + barWidth / 2} y={height + 30} textAnchor="middle" fontSize={10} fill={tokens["--chart-label"]} fontWeight={600}>{stage.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function rankBy(apps, key) {
  return Object.entries(apps.reduce((acc, app) => {
    const value = app[key]?.trim();
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

export default function AnalyticsView({ apps, theme }) {
  const t = useChartTokens(theme);
  const metrics = buildTrackerMetrics(apps);
  const stageOrder = ["No Interview", "1st Interview", "2nd Interview", "3rd Interview", "Home Assignment", "Final Interview"];
  const roleFocus = rankBy(apps, "role");
  const locationFocus = rankBy(apps, "location");
  const followUpHistory = apps.flatMap((app) => app.followUpHistory || []);
  const followUpCompleted = followUpHistory.length;
  const followUpByMethod = Object.entries(followUpHistory.reduce((acc, item) => {
    const method = item.method || "Unknown";
    acc[method] = (acc[method] || 0) + 1;
    return acc;
  }, {})).map(([method, count]) => ({ method, count }));
  const openApps = apps.filter((app) => !["Rejected", "Withdrawn", "Ghosted", "Offer"].includes(app.status));
  // Age buckets are ordinal, so they read as a green→red severity progression
  // rather than four unrelated hues.
  const agingBuckets = [
    { label: "0-7 days", count: openApps.filter((app) => daysSince(app.dateApplied) <= 7).length, color: t["--status-offer"] },
    { label: "8-14 days", count: openApps.filter((app) => daysSince(app.dateApplied) > 7 && daysSince(app.dateApplied) <= 14).length, color: t["--status-applied"] },
    { label: "15-21 days", count: openApps.filter((app) => daysSince(app.dateApplied) > 14 && daysSince(app.dateApplied) <= 21).length, color: t["--status-followup"] },
    { label: "22+ days", count: openApps.filter((app) => daysSince(app.dateApplied) > 21).length, color: t["--status-rejected"] },
  ];

  if (apps.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state__icon" aria-hidden="true">📊</p>
        <p className="empty-state__text">Add applications to see your analytics.</p>
      </div>
    );
  }

  const scoreTone = metrics.pipelineScore >= 75 ? t["--success"] : metrics.pipelineScore >= 55 ? t["--warning"] : t["--danger"];

  return (
    <>
      <div className="metric-grid">
        {[
          { label: "Total Applied", value: apps.length, ink: "var(--accent-ink)", emoji: "📤" },
          { label: "Active Pipeline", value: metrics.activeApplications, ink: "var(--teal)", emoji: "🧭" },
          { label: "Response Rate", value: `${metrics.responseRate}%`, ink: "var(--status-interview)", emoji: "📬" },
          { label: "Interview Rate", value: `${metrics.interviewRate}%`, ink: "var(--status-applied)", emoji: "🗣️" },
          { label: "Reached Interview", value: metrics.everInterviewedCount, ink: "var(--rose)", emoji: "🎯" },
          { label: "Offer Rate", value: `${metrics.offerRate}%`, ink: "var(--status-offer)", emoji: "🎉" },
          { label: "Avg Rejection Time", value: metrics.avgDaysToRejection === null ? "—" : `${metrics.avgDaysToRejection}d`, ink: "var(--status-rejected)", emoji: "⏱️" },
          { label: "Avg To Interview", value: metrics.avgDaysToInterview === null ? "—" : `${metrics.avgDaysToInterview}d`, ink: "var(--teal)", emoji: "⚡" },
          { label: "Avg Open Age", value: metrics.avgOpenAge === null ? "—" : `${metrics.avgOpenAge}d`, ink: "var(--muted)", emoji: "📌" },
          { label: "Ghost Risk", value: metrics.atRiskApps.length, ink: "var(--tone-risk-ink)", emoji: "⏳" },
          { label: "Ghost Rate", value: `${metrics.ghostRate}%`, ink: "var(--status-ghosted)", emoji: "👻" },
          { label: "Follow-Ups Logged", value: followUpCompleted, ink: "var(--status-followup)", emoji: "🔔" },
        ].map((card) => (
          <div key={card.label} className="metric-tile" style={{ "--m-ink": card.ink }}>
            <div className="metric-tile__icon" aria-hidden="true">{card.emoji}</div>
            <div className="metric-tile__value">{card.value}</div>
            <div className="metric-tile__label">{card.label}</div>
          </div>
        ))}
      </div>

      <SectionCard title="Pipeline Health" subtitle="The fastest read on momentum and risk." className="section-card--spaced">
        <div className="dash-grid dash-grid--tight dash-grid--flush">
          {[
            { label: "Follow-ups due", value: metrics.dueFollowUps.length, ink: "var(--status-followup)", note: "Clear these before adding low-fit leads." },
            { label: "Near ghosting", value: metrics.atRiskApps.length, ink: "var(--tone-risk-ink)", note: `Within ${GHOST_DAYS} days of no response.` },
            { label: "Fresh this week", value: metrics.freshThisWeek, ink: "var(--status-applied)", note: "New applications added recently." },
            { label: "Interview queue", value: metrics.interviewQueue.length, ink: "var(--status-interview)", note: "Roles requiring close prep." },
          ].map((item) => (
            <div key={item.label} className="health-tile" style={{ "--m-ink": item.ink }}>
              <div className="health-tile__value">{item.value}</div>
              <div className="health-tile__label">{item.label}</div>
              <div className="health-tile__note">{item.note}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="dash-grid dash-grid--lead">
        <SectionCard title="Search Control Score" subtitle="A practical health score based on freshness, follow-ups, interviews, and ghost risk.">
          <div className="stack stack--wide">
            <div className="score-row" style={{ "--m-ink": scoreTone }}>
              <div className="score-value">{metrics.pipelineScore}</div>
              <div className="score-max">/ 100</div>
            </div>
            <div className="meter__track meter__track--tall" style={{ "--m-ink": scoreTone }}>
              <div className="meter__fill" style={{ width: `${metrics.pipelineScore}%` }} />
            </div>
            <p className="health-tile__note">
              Higher scores mean recent applications, fewer overdue follow-ups, lower ghost risk, and an active interview queue.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Priority Action Queue" subtitle="The next operational moves the tracker recommends.">
          {metrics.nextActions.length > 0 ? (
            <div className="stack">
              {metrics.nextActions.map((action) => (
                <div key={action.label} className="action-tile" data-tone={action.tone}>
                  <div className="action-tile__label">{action.label}</div>
                  <div className="action-tile__detail">{action.detail}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-note">No urgent workflow issues. Keep applications and interview stages current.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Daily Activity — Last 7 Days" className="section-card--spaced">
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={metrics.last7} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="day" {...axisProps(t)} />
            <YAxis {...axisProps(t)} allowDecimals={false} />
            <Tooltip {...tooltipProps(t)} />
            <Bar dataKey="count" name="Applications logged" radius={[4, 4, 0, 0]}>
              {metrics.last7.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.weekend ? t["--chart-weekend"] : entry.count >= 3 ? t["--status-offer"] : entry.count > 0 ? t["--status-applied"] : t["--chart-empty"]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title="Momentum — Last 4 Weeks" subtitle="Applications logged against status responses recorded in each week." className="section-card--spaced">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={metrics.last28} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="week" {...axisProps(t)} />
            <YAxis {...axisProps(t)} allowDecimals={false} />
            <Tooltip {...tooltipProps(t)} />
            <Bar dataKey="applied" fill={t["--status-applied"]} radius={[4, 4, 0, 0]} name="Applications" />
            <Bar dataKey="responses" fill={t["--teal"]} radius={[4, 4, 0, 0]} name="Responses" />
          </BarChart>
        </ResponsiveContainer>
        {/* Two series, so identity cannot rest on position alone. */}
        <div className="chart-legend">
          <span className="chart-legend__item"><span className="chart-legend__swatch" style={{ background: t["--status-applied"] }} />Applications</span>
          <span className="chart-legend__item"><span className="chart-legend__swatch" style={{ background: t["--teal"] }} />Responses</span>
        </div>
      </SectionCard>

      <SectionCard title="Application Funnel" subtitle="Set interview stages on applications to make this more precise." className="section-card--spaced">
        <SankeyFunnel apps={apps} tokens={t} />
      </SectionCard>

      <div className="dash-grid dash-grid--auto">
        <SectionCard title="Status Breakdown">
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={metrics.statusCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} labelLine={false} label={({ name, value }) => value > 0 ? `${name} (${value})` : ""}>
                {metrics.statusCounts.map((entry, index) => <Cell key={index} fill={t[entry.cssVar]} stroke={t["--surface-chart"]} strokeWidth={2} />)}
              </Pie>
              <Tooltip {...tooltipProps(t)} />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Applications by Month">
          {metrics.monthData.length === 0 ? <p className="chart-empty">No date data yet.</p> : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={metrics.monthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" {...axisProps(t)} />
                <YAxis {...axisProps(t)} allowDecimals={false} />
                <Tooltip {...tooltipProps(t)} />
                <Bar dataKey="count" fill={t["--status-applied"]} radius={[4, 4, 0, 0]} name="Applications" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <div className="dash-grid dash-grid--auto">
        <SectionCard title="Rejection by Stage" subtitle="Where rejections happen after application or interview.">
          {metrics.rejectedApps.length === 0 ? (
            <p className="muted-note">No rejections logged yet.</p>
          ) : stageOrder.map((stage) => {
            const count = metrics.rejectionsByStage[stage] || 0;
            if (count === 0) return null;
            const pct = Math.round((count / metrics.rejectedApps.length) * 100);
            const ink = stage === "No Interview" ? "var(--status-ghosted)" : "var(--status-rejected)";
            return (
              <div key={stage} className="meter" style={{ "--m-ink": ink }}>
                <div className="meter__head">
                  <span className="meter__label">{stage}</span>
                  <span className="meter__value">{count} ({pct}%)</span>
                </div>
                <div className="meter__track">
                  <div className="meter__fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </SectionCard>

        <SectionCard title="Active Application Age" subtitle="How long open items have been waiting.">
          {agingBuckets.map((bucket) => {
            const pct = openApps.length > 0 ? Math.round((bucket.count / openApps.length) * 100) : 0;
            return (
              <div key={bucket.label} className="meter" style={{ "--m-ink": bucket.color }}>
                <div className="meter__head">
                  <span className="meter__label">{bucket.label}</span>
                  <span className="meter__value">{bucket.count} ({pct}%)</span>
                </div>
                <div className="meter__track">
                  <div className="meter__fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </SectionCard>
      </div>

      <div className="dash-grid dash-grid--auto">
        <SectionCard title="Role Outcome Quality" subtitle="Which role families are generating interviews, not just volume.">
          {metrics.roleOutcomes.length > 0 ? metrics.roleOutcomes.map((item) => (
            <div key={item.label} className="rank-row">
              <div className="rank-row__head">
                <span className="rank-row__label">{item.label}</span>
                <span className="rank-row__total">{item.total}</span>
              </div>
              <div className="rank-row__stats">
                <span>{item.responseRate}% response</span>
                <span>{item.interviewRate}% interview</span>
                <span>{item.active} active</span>
              </div>
            </div>
          )) : <p className="muted-note">No role outcome data yet.</p>}
        </SectionCard>

        <SectionCard title="Location Outcome Quality" subtitle="Where the search is producing signal.">
          {metrics.locationOutcomes.length > 0 ? metrics.locationOutcomes.map((item) => (
            <div key={item.label} className="rank-row">
              <div className="rank-row__head">
                <span className="rank-row__label">{item.label}</span>
                <span className="rank-row__total">{item.total}</span>
              </div>
              <div className="rank-row__stats">
                <span>{item.responseRate}% response</span>
                <span>{item.interviewRate}% interview</span>
                <span>{item.active} active</span>
              </div>
            </div>
          )) : <p className="muted-note">No location outcome data yet.</p>}
        </SectionCard>

        <SectionCard title="Source Outcome Quality" subtitle="Which application channels are worth doubling down on.">
          {metrics.sourceOutcomes.length > 0 ? metrics.sourceOutcomes.map((item) => (
            <div key={item.label} className="rank-row">
              <div className="rank-row__head">
                <span className="rank-row__label">{item.label}</span>
                <span className="rank-row__total">{item.total}</span>
              </div>
              <div className="rank-row__stats">
                <span>{item.responseRate}% response</span>
                <span>{item.interviewRate}% interview</span>
                <span>{item.active} active</span>
              </div>
            </div>
          )) : <p className="muted-note">Add sources on applications to compare channels.</p>}
        </SectionCard>
      </div>

      <div className="dash-grid dash-grid--auto">
        <SectionCard title="Workflow Gaps" subtitle="Open records that need housekeeping.">
          {[
            { label: "No follow-up date", count: metrics.unscheduledFollowUps.length, ink: "var(--status-applied)", items: metrics.unscheduledFollowUps },
            { label: "Stale records", count: metrics.staleApps.length, ink: "var(--muted)", items: metrics.staleApps },
            { label: "Stalled interviews", count: metrics.stalledInterviews.length, ink: "var(--status-interview)", items: metrics.stalledInterviews },
          ].map((group) => (
            <div key={group.label} className="gap-group" style={{ "--m-ink": group.ink }}>
              <div className="gap-group__head">
                <span>{group.label}</span>
                <span>{group.count}</span>
              </div>
              {group.items.slice(0, 3).map((app) => (
                <div key={app.id} className="gap-group__item">
                  <strong>{app.company}</strong> · {app.role}
                </div>
              ))}
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Follow-Up Effectiveness" subtitle="Completed follow-ups by channel.">
          {followUpByMethod.length === 0 ? (
            <p className="muted-note">No follow-up history logged yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={followUpByMethod} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="method" {...axisProps(t)} />
                <YAxis {...axisProps(t)} allowDecimals={false} />
                <Tooltip {...tooltipProps(t)} />
                <Bar dataKey="count" fill={t["--status-followup"]} radius={[4, 4, 0, 0]} name="Follow-ups" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Role Concentration" subtitle="Where most applications are going.">
          {roleFocus.length > 0 ? roleFocus.map(([role, count]) => (
            <div key={role} className="rank-row rank-row__head">
              <span className="rank-row__label">{role}</span>
              <span className="rank-row__total">{count}</span>
            </div>
          )) : <p className="muted-note">No role data yet.</p>}
        </SectionCard>

        <SectionCard title="Location Concentration" subtitle="Useful for spotting search-market focus.">
          {locationFocus.length > 0 ? locationFocus.map(([location, count]) => (
            <div key={location} className="rank-row rank-row__head">
              <span className="rank-row__label">{location}</span>
              <span className="rank-row__total">{count}</span>
            </div>
          )) : <p className="muted-note">No location data yet.</p>}
        </SectionCard>
      </div>

      <SectionCard title="Outcome Breakdown">
        {Object.keys(STATUS_CONFIG).map((status) => {
          const count = apps.filter((app) => app.status === status).length;
          const pct = apps.length > 0 ? (count / apps.length) * 100 : 0;
          const cfg = STATUS_CONFIG[status];
          return (
            <div key={status} className="meter" data-status={status} style={{ "--m-ink": "var(--s-ink)" }}>
              <div className="meter__head">
                <span className="meter__label"><span aria-hidden="true">{cfg.emoji}</span> {status}</span>
                <span className="meter__value">{count} ({Math.round(pct)}%)</span>
              </div>
              <div className="meter__track">
                <div className="meter__fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </SectionCard>
    </>
  );
}
