import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GHOST_DAYS, STATUS_CONFIG } from "../../constants";
import { STAGE_DEPTH, buildTrackerMetrics } from "../../utils/applicationMetrics";
import { daysSince } from "../../utils/dates";

function SectionCard({ title, subtitle, actions = null, children, style = {} }) {
  return (
    <section className="section-card" style={style}>
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

function SankeyFunnel({ apps }) {
  const reachedAtLeast = (depth) => apps.filter((app) => {
    const ownDepth = STAGE_DEPTH[app.interviewStage] || 0;
    if (ownDepth >= depth) return true;
    if (app.status === "Offer" && depth <= 5) return true;
    if (app.status === "Interview" && depth <= 1) return true;
    return false;
  }).length;
  const stages = [
    { label: "Applied", count: apps.length, color: "#3B82F6" },
    { label: "1st Interview", count: reachedAtLeast(1), color: "#8B5CF6" },
    { label: "2nd+ Interview", count: reachedAtLeast(2), color: "#EC4899" },
    { label: "Final Round", count: reachedAtLeast(4), color: "#F59E0B" },
    { label: "Offer", count: apps.filter((app) => app.status === "Offer").length, color: "#10B981" },
  ];
  const maxCount = stages[0].count || 1;
  const width = 600;
  const height = 220;
  const padX = 60;
  const barWidth = 60;
  const gap = (width - padX * 2 - barWidth * stages.length) / (stages.length - 1);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height + 60}`} style={{ width: "100%", maxWidth: width, display: "block", margin: "0 auto" }}>
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
                      <text x={midX} y={(y + barHeight / 2 + ny + nextHeight / 2) / 2} textAnchor="middle" fontSize={10} fontWeight={700} fill="#475569">{conversion}%</text>
                    )}
                  </>
                );
              })()}
              <rect x={x} y={y} width={barWidth} height={barHeight} rx={6} fill={stage.color} />
              <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fontSize={15} fontWeight={800} fill={stage.color}>{stage.count}</text>
              <text x={x + barWidth / 2} y={height + 30} textAnchor="middle" fontSize={10} fill="#6B7280" fontWeight={600}>{stage.label}</text>
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

export default function AnalyticsView({ apps }) {
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
  const agingBuckets = [
    { label: "0-7 days", count: openApps.filter((app) => daysSince(app.dateApplied) <= 7).length, color: "#10B981" },
    { label: "8-14 days", count: openApps.filter((app) => daysSince(app.dateApplied) > 7 && daysSince(app.dateApplied) <= 14).length, color: "#3B82F6" },
    { label: "15-21 days", count: openApps.filter((app) => daysSince(app.dateApplied) > 14 && daysSince(app.dateApplied) <= 21).length, color: "#F59E0B" },
    { label: "22+ days", count: openApps.filter((app) => daysSince(app.dateApplied) > 21).length, color: "#EF4444" },
  ];

  if (apps.length === 0) {
    return (
      <div style={{ background: "#fff", borderRadius: 14, padding: "60px 24px", textAlign: "center", border: "1.5px dashed #E5E7EB" }}>
        <p style={{ fontSize: 40, margin: "0 0 10px" }}>📊</p>
        <p style={{ color: "#9CA3AF", fontSize: 14 }}>Add applications to see your analytics.</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Total Applied", value: apps.length, color: "#1F4E79", emoji: "📤" },
          { label: "Active Pipeline", value: metrics.activeApplications, color: "#0F766E", emoji: "🧭" },
          { label: "Response Rate", value: `${metrics.responseRate}%`, color: "#8B5CF6", emoji: "📬" },
          { label: "Interview Rate", value: `${metrics.interviewRate}%`, color: "#3B82F6", emoji: "🗣️" },
          { label: "Reached Interview", value: metrics.everInterviewedCount, color: "#EC4899", emoji: "🎯" },
          { label: "Offer Rate", value: `${metrics.offerRate}%`, color: "#10B981", emoji: "🎉" },
          { label: "Avg Rejection Time", value: metrics.avgDaysToRejection === null ? "—" : `${metrics.avgDaysToRejection}d`, color: "#EF4444", emoji: "⏱️" },
          { label: "Avg To Interview", value: metrics.avgDaysToInterview === null ? "—" : `${metrics.avgDaysToInterview}d`, color: "#0F766E", emoji: "⚡" },
          { label: "Avg Open Age", value: metrics.avgOpenAge === null ? "—" : `${metrics.avgOpenAge}d`, color: "#64748B", emoji: "📌" },
          { label: "Ghost Risk", value: metrics.atRiskApps.length, color: "#EA580C", emoji: "⏳" },
          { label: "Ghost Rate", value: `${metrics.ghostRate}%`, color: "#9CA3AF", emoji: "👻" },
          { label: "Follow-Ups Logged", value: followUpCompleted, color: "#F59E0B", emoji: "🔔" },
        ].map((card) => (
          <div key={card.label} style={{ background: "#fff", borderRadius: 13, padding: "16px 12px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1.5px solid #E5E7EB" }}>
            <div style={{ fontSize: 20 }}>{card.emoji}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: card.color, fontFamily: "Georgia,serif", margin: "4px 0 2px" }}>{card.value}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.05em" }}>{card.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      <SectionCard title="Pipeline Health" subtitle="The fastest read on momentum and risk." style={{ marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {[
            { label: "Follow-ups due", value: metrics.dueFollowUps.length, color: "#F59E0B", note: "Clear these before adding low-fit leads." },
            { label: "Near ghosting", value: metrics.atRiskApps.length, color: "#EA580C", note: `Within ${GHOST_DAYS} days of no response.` },
            { label: "Fresh this week", value: metrics.freshThisWeek, color: "#3B82F6", note: "New applications added recently." },
            { label: "Interview queue", value: metrics.interviewQueue.length, color: "#8B5CF6", note: "Roles requiring close prep." },
          ].map((item) => (
            <div key={item.label} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ color: item.color, fontWeight: 800, fontSize: 24, fontFamily: "Georgia,serif" }}>{item.value}</div>
              <div style={{ color: "#0F172A", fontWeight: 800, fontSize: 12, marginTop: 2 }}>{item.label}</div>
              <div style={{ color: "#64748B", fontSize: 11, lineHeight: 1.5, marginTop: 4 }}>{item.note}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 0.72fr) minmax(300px, 1.28fr)", gap: 14, marginBottom: 14 }}>
        <SectionCard title="Search Control Score" subtitle="A practical health score based on freshness, follow-ups, interviews, and ghost risk.">
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontSize: 42, fontFamily: "Georgia,serif", fontWeight: 800, color: metrics.pipelineScore >= 75 ? "#0F766E" : metrics.pipelineScore >= 55 ? "#B45309" : "#DC2626" }}>
                {metrics.pipelineScore}
              </div>
              <div style={{ color: "#64748B", fontSize: 13, fontWeight: 800 }}>/ 100</div>
            </div>
            <div style={{ height: 10, background: "#E5E7EB", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${metrics.pipelineScore}%`, background: metrics.pipelineScore >= 75 ? "#0F766E" : metrics.pipelineScore >= 55 ? "#F59E0B" : "#EF4444" }} />
            </div>
            <p style={{ margin: 0, color: "#64748B", fontSize: 12, lineHeight: 1.6 }}>
              Higher scores mean recent applications, fewer overdue follow-ups, lower ghost risk, and an active interview queue.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Priority Action Queue" subtitle="The next operational moves the tracker recommends.">
          {metrics.nextActions.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {metrics.nextActions.map((action) => {
                const tone = {
                  warning: { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E" },
                  interview: { bg: "#F5F3FF", border: "#DDD6FE", color: "#6D28D9" },
                  followup: { bg: "#EFF6FF", border: "#BFDBFE", color: "#1D4ED8" },
                  risk: { bg: "#FFF7ED", border: "#FED7AA", color: "#C2410C" },
                  neutral: { bg: "#F8FAFC", border: "#E2E8F0", color: "#475569" },
                }[action.tone] || { bg: "#F8FAFC", border: "#E2E8F0", color: "#475569" };
                return (
                  <div key={action.label} style={{ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ color: tone.color, fontWeight: 800, fontSize: 13 }}>{action.label}</div>
                    <div style={{ color: "#64748B", fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>{action.detail}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ margin: 0, color: "#64748B", fontSize: 13 }}>No urgent workflow issues. Keep applications and interview stages current.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Daily Activity - Last 7 Days" style={{ marginBottom: 14 }}>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={metrics.last7} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name="Applications logged" radius={[5, 5, 0, 0]}>
              {metrics.last7.map((entry, index) => <Cell key={index} fill={entry.weekend ? "#D1D5DB" : entry.count >= 3 ? "#10B981" : entry.count > 0 ? "#3B82F6" : "#E5E7EB"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title="Momentum - Last 4 Weeks" subtitle="Applications logged against status responses recorded in each week." style={{ marginBottom: 14 }}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={metrics.last28} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="applied" fill="#3B82F6" radius={[5, 5, 0, 0]} name="Applications" />
            <Bar dataKey="responses" fill="#0F766E" radius={[5, 5, 0, 0]} name="Responses" />
          </BarChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard title="Application Funnel" subtitle="Set interview stages on applications to make this more precise." style={{ marginBottom: 14 }}>
        <SankeyFunnel apps={apps} />
      </SectionCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
        <SectionCard title="Status Breakdown">
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={metrics.statusCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} labelLine={false} label={({ name, value }) => value > 0 ? `${name} (${value})` : ""}>
                {metrics.statusCounts.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Applications by Month">
          {metrics.monthData.length === 0 ? <p style={{ color: "#9CA3AF", fontSize: 12, textAlign: "center", paddingTop: 40 }}>No date data yet.</p> : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={metrics.monthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" radius={[5, 5, 0, 0]} name="Applications" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
        <SectionCard title="Rejection by Stage" subtitle="Where rejections happen after application or interview.">
          {metrics.rejectedApps.length === 0 ? (
            <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>No rejections logged yet.</p>
          ) : stageOrder.map((stage) => {
            const count = metrics.rejectionsByStage[stage] || 0;
            if (count === 0) return null;
            const pct = Math.round((count / metrics.rejectedApps.length) * 100);
            const color = stage === "No Interview" ? "#9CA3AF" : "#EF4444";
            return (
              <div key={stage} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  <span style={{ color: "#374151" }}>{stage}</span>
                  <span style={{ color }}>{count} ({pct}%)</span>
                </div>
                <div style={{ background: "#F3F4F6", borderRadius: 6, height: 8, overflow: "hidden" }}>
                  <div style={{ background: color, height: "100%", width: `${pct}%`, borderRadius: 6 }} />
                </div>
              </div>
            );
          })}
        </SectionCard>

        <SectionCard title="Active Application Age" subtitle="How long open items have been waiting.">
          {agingBuckets.map((bucket) => {
            const pct = openApps.length > 0 ? Math.round((bucket.count / openApps.length) * 100) : 0;
            return (
              <div key={bucket.label} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  <span style={{ color: "#374151" }}>{bucket.label}</span>
                  <span style={{ color: bucket.color }}>{bucket.count} ({pct}%)</span>
                </div>
                <div style={{ background: "#F3F4F6", borderRadius: 6, height: 8, overflow: "hidden" }}>
                  <div style={{ background: bucket.color, height: "100%", width: `${pct}%`, borderRadius: 6 }} />
                </div>
              </div>
            );
          })}
        </SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
        <SectionCard title="Role Outcome Quality" subtitle="Which role families are generating interviews, not just volume.">
          {metrics.roleOutcomes.length > 0 ? metrics.roleOutcomes.map((item) => (
            <div key={item.label} style={{ borderBottom: "1px solid #F1F5F9", padding: "9px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, fontWeight: 800 }}>
                <span style={{ color: "#334155" }}>{item.label}</span>
                <span style={{ color: "#1F4E79" }}>{item.total}</span>
              </div>
              <div style={{ marginTop: 5, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, fontSize: 11, color: "#64748B" }}>
                <span>{item.responseRate}% response</span>
                <span>{item.interviewRate}% interview</span>
                <span>{item.active} active</span>
              </div>
            </div>
          )) : <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>No role outcome data yet.</p>}
        </SectionCard>

        <SectionCard title="Location Outcome Quality" subtitle="Where the search is producing signal.">
          {metrics.locationOutcomes.length > 0 ? metrics.locationOutcomes.map((item) => (
            <div key={item.label} style={{ borderBottom: "1px solid #F1F5F9", padding: "9px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, fontWeight: 800 }}>
                <span style={{ color: "#334155" }}>{item.label}</span>
                <span style={{ color: "#1F4E79" }}>{item.total}</span>
              </div>
              <div style={{ marginTop: 5, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, fontSize: 11, color: "#64748B" }}>
                <span>{item.responseRate}% response</span>
                <span>{item.interviewRate}% interview</span>
                <span>{item.active} active</span>
              </div>
            </div>
          )) : <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>No location outcome data yet.</p>}
        </SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
        <SectionCard title="Workflow Gaps" subtitle="Open records that need housekeeping.">
          {[
            { label: "No follow-up date", count: metrics.unscheduledFollowUps.length, color: "#3B82F6", items: metrics.unscheduledFollowUps },
            { label: "Stale records", count: metrics.staleApps.length, color: "#64748B", items: metrics.staleApps },
            { label: "Stalled interviews", count: metrics.stalledInterviews.length, color: "#8B5CF6", items: metrics.stalledInterviews },
          ].map((group) => (
            <div key={group.label} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: group.color, marginBottom: 6 }}>
                <span>{group.label}</span>
                <span>{group.count}</span>
              </div>
              {group.items.slice(0, 3).map((app) => (
                <div key={app.id} style={{ fontSize: 12, color: "#475569", padding: "5px 0", borderTop: "1px solid #F1F5F9" }}>
                  <strong>{app.company}</strong> · {app.role}
                </div>
              ))}
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Follow-Up Effectiveness" subtitle="Completed follow-ups by channel.">
          {followUpByMethod.length === 0 ? (
            <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>No follow-up history logged yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={followUpByMethod} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="method" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#F59E0B" radius={[5, 5, 0, 0]} name="Follow-ups" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Role Concentration" subtitle="Where most applications are going.">
          {roleFocus.length > 0 ? roleFocus.map(([role, count]) => (
            <div key={role} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #F1F5F9", padding: "9px 0", fontSize: 13 }}>
              <span style={{ color: "#334155", fontWeight: 700 }}>{role}</span>
              <span style={{ color: "#1F4E79", fontWeight: 800 }}>{count}</span>
            </div>
          )) : <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>No role data yet.</p>}
        </SectionCard>

        <SectionCard title="Location Concentration" subtitle="Useful for spotting search-market focus.">
          {locationFocus.length > 0 ? locationFocus.map(([location, count]) => (
            <div key={location} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #F1F5F9", padding: "9px 0", fontSize: 13 }}>
              <span style={{ color: "#334155", fontWeight: 700 }}>{location}</span>
              <span style={{ color: "#1F4E79", fontWeight: 800 }}>{count}</span>
            </div>
          )) : <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>No location data yet.</p>}
        </SectionCard>
      </div>

      <SectionCard title="Outcome Breakdown">
        {Object.keys(STATUS_CONFIG).map((status) => {
          const count = apps.filter((app) => app.status === status).length;
          const pct = apps.length > 0 ? (count / apps.length) * 100 : 0;
          const cfg = STATUS_CONFIG[status];
          return (
            <div key={status} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                <span style={{ color: "#374151" }}>{cfg.emoji} {status}</span>
                <span style={{ color: cfg.color }}>{count} ({Math.round(pct)}%)</span>
              </div>
              <div style={{ background: "#F3F4F6", borderRadius: 6, height: 8, overflow: "hidden" }}>
                <div style={{ background: cfg.color, height: "100%", width: `${pct}%`, borderRadius: 6 }} />
              </div>
            </div>
          );
        })}
      </SectionCard>
    </>
  );
}
