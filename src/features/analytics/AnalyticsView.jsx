import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MIN_SAMPLE, RANGES, buildAnalytics } from "../../utils/analytics";
import { addDays, formatDate, todayISO } from "../../utils/dates";
import { buildEmploymentMetrics, formatTenure } from "../../utils/employment";
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
  return { tick: { fontSize: 11, fill: t["--chart-label"] }, stroke: t["--chart-axis"], tickLine: false };
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="segmented__option"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Funnel stages are ordinal — reordering them would change their meaning — so
 * they take a single-hue ramp that darkens with depth rather than a rotating
 * set of hues.
 */
function SankeyFunnel({ stages: counts, tokens }) {
  const ramp = ["--funnel-1", "--funnel-2", "--funnel-3", "--funnel-4", "--funnel-5", "--status-secured"];
  const stages = counts.map((stage, index) => ({ ...stage, color: tokens[ramp[index]] }));
  const maxCount = stages[0].count || 1;
  const width = 600;
  const height = 220;
  const padX = 60;
  const barWidth = 56;
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

// Stack order, bottom to top. Neighbours were checked for colour-blind
// separation in both themes, which is why "still open" sits between the two
// outcomes rather than on top.
const OUTCOMES = [
  { key: "progressed", label: "Reached interview", token: "--status-offer" },
  { key: "open", label: "Still open", token: "--status-applied" },
  { key: "rejected", label: "Rejected, no interview", token: "--status-rejected" },
  { key: "silent", label: "Ghosted or withdrawn", token: "--status-ghosted" },
];

const SEGMENT_TABS = [
  { id: "source", label: "Source", empty: "Add a source to applications to compare channels." },
  { id: "role", label: "Role", empty: "No role data in this range." },
  { id: "location", label: "Location", empty: "No location data in this range." },
  { id: "weekday", label: "Day applied", empty: "No dated applications in this range." },
];

const AGE_TOKENS = { fresh: "var(--status-offer)", ok: "var(--status-applied)", ageing: "var(--status-followup)", stale: "var(--status-rejected)" };

const days = (value) => (value === null ? "—" : `${value}d`);

export default function AnalyticsView({ apps, theme }) {
  const t = useChartTokens(theme);
  const [rangeId, setRangeId] = useState("all");
  const [segmentId, setSegmentId] = useState("source");
  const range = RANGES.find((item) => item.id === rangeId) || RANGES[2];
  const today = todayISO();
  const data = useMemo(() => buildAnalytics(apps, { today, days: range.days }), [apps, today, range.days]);
  const employment = useMemo(() => buildEmploymentMetrics(apps), [apps]);
  const longestTenure = employment.longestTenure?.tenure || 0;

  if (apps.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state__icon" aria-hidden="true">📊</p>
        <p className="empty-state__text">Add applications to see your analytics.</p>
      </div>
    );
  }

  const { kpis, timing, followUps, rejections } = data;
  const delta = kpis.previousTotal === null ? null : kpis.total - kpis.previousTotal;
  const segment = SEGMENT_TABS.find((tab) => tab.id === segmentId) || SEGMENT_TABS[0];
  const segmentRows = data.segments[segment.id];
  const maxSegmentRate = Math.max(1, ...segmentRows.map((row) => row.interviewRate));
  const followUpGroups = [
    { label: "Followed up", ...followUps.chased, ink: "var(--status-offer)" },
    { label: "Left alone", ...followUps.left, ink: "var(--status-ghosted)" },
  ];

  return (
    <>
      <div className="analytics-bar">
        <p className="analytics-bar__caption">
          <strong>{kpis.total}</strong> application{kpis.total !== 1 ? "s" : ""}{" "}
          {range.days ? `sent since ${formatDate(addDays(today, -(range.days - 1)))}` : "tracked in total"}
        </p>
        <Segmented label="Date range" options={RANGES} value={rangeId} onChange={setRangeId} />
      </div>

      {kpis.total === 0 ? (
        <div className="empty-state">
          <p className="empty-state__text">No applications were sent in the last {range.days} days.</p>
          <button type="button" className="modal-button modal-button--secondary" onClick={() => setRangeId("all")}>Show all time</button>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            {[
              {
                label: "Applications",
                value: kpis.total,
                note: delta === null ? "all time" : `${delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} ${Math.abs(delta)} vs prior ${range.days} days`,
              },
              { label: "Reply rate", value: `${kpis.replyRate}%`, note: `${kpis.replied} of ${kpis.total} heard back` },
              { label: "Interview rate", value: `${kpis.interviewRate}%`, note: `${kpis.interviews} of ${kpis.total} reached interview` },
              { label: "Offer rate", value: `${kpis.offerRate}%`, note: `${kpis.offers} of ${kpis.total} reached offer` },
              { label: "Median reply time", value: days(kpis.medianReplyDays), note: timing.count > 0 ? `across ${timing.count} repl${timing.count !== 1 ? "ies" : "y"}` : "no replies dated yet" },
              { label: "Ghost rate", value: `${kpis.ghostRate}%`, note: `${kpis.ghosted} of ${kpis.total} went silent` },
            ].map((card) => (
              <div key={card.label} className="kpi">
                <div className="kpi__label">{card.label}</div>
                <div className="kpi__value">{card.value}</div>
                <div className="kpi__note">{card.note}</div>
              </div>
            ))}
          </div>

          {data.insights.length > 0 && (
            <SectionCard title="What the Data Says" subtitle="Plain-language takeaways, shown only once there is enough data behind them." className="section-card--spaced">
              <div className="insight-grid">
                {data.insights.map((insight) => (
                  <div key={insight.title} className="insight" data-tone={insight.tone}>
                    <div className="insight__title">{insight.title}</div>
                    <div className="insight__detail">{insight.detail}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Applications and How They Turned Out"
            subtitle={`Grouped by the ${data.cohorts.unit} each application was sent. Recent ${data.cohorts.unit}s carry more open applications because employers haven't answered yet.`}
            className="section-card--spaced"
          >
            <div role="img" aria-label={`Applications per ${data.cohorts.unit} by outcome: ${data.cohorts.buckets.map((b) => `${b.label} ${b.total}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.cohorts.buckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke={t["--chart-grid"]} />
                  <XAxis dataKey="label" {...axisProps(t)} minTickGap={12} />
                  <YAxis {...axisProps(t)} allowDecimals={false} axisLine={false} />
                  <Tooltip {...tooltipProps(t)} />
                  {OUTCOMES.map((outcome) => (
                    <Bar key={outcome.key} dataKey={outcome.key} stackId="outcome" name={outcome.label} fill={t[outcome.token]} stroke={t["--surface-chart"]} strokeWidth={1} maxBarSize={44} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-legend">
              {OUTCOMES.map((outcome) => (
                <span key={outcome.key} className="chart-legend__item"><span className="chart-legend__swatch" style={{ background: t[outcome.token] }} />{outcome.label}</span>
              ))}
            </div>
          </SectionCard>

          <div className="dash-grid dash-grid--auto">
            <SectionCard title="Application Funnel" subtitle="How far applications get, with the conversion between each step.">
              <SankeyFunnel stages={data.funnel} tokens={t} />
            </SectionCard>

            <SectionCard title="How Long Replies Take" subtitle="Days from applying to the first answer of any kind.">
              {timing.count === 0 ? (
                <p className="muted-note">No dated replies in this range yet.</p>
              ) : (
                <>
                  <div className="fact-row">
                    <div><span className="fact-row__value">{days(timing.median)}</span><span className="fact-row__label">median reply</span></div>
                    <div><span className="fact-row__value">{days(timing.p80)}</span><span className="fact-row__label">80% arrive by</span></div>
                    <div><span className="fact-row__value">{days(timing.medianToInterview)}</span><span className="fact-row__label">to interview</span></div>
                    <div><span className="fact-row__value">{days(timing.medianToRejection)}</span><span className="fact-row__label">to rejection</span></div>
                  </div>
                  <div role="img" aria-label={`Replies by days waited: ${timing.buckets.map((b) => `${b.label} ${b.count}`).join(", ")}`}>
                    <ResponsiveContainer width="100%" height={170}>
                      <BarChart data={timing.buckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={t["--chart-grid"]} />
                        <XAxis dataKey="label" {...axisProps(t)} interval={0} />
                        <YAxis {...axisProps(t)} allowDecimals={false} axisLine={false} />
                        <Tooltip {...tooltipProps(t)} />
                        <Bar dataKey="count" name="Replies" fill={t["--status-applied"]} radius={[4, 4, 0, 0]} maxBarSize={48} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </SectionCard>
          </div>

          <div className="dash-grid dash-grid--auto">
            <SectionCard
              title="What's Working"
              subtitle="Ranked by interview rate, not volume."
              actions={<Segmented label="Compare by" options={SEGMENT_TABS} value={segmentId} onChange={setSegmentId} />}
            >
              {segmentRows.length === 0 ? <p className="muted-note">{segment.empty}</p> : segmentRows.map((row) => (
                <div key={row.label} className="meter segment-row" data-thin={row.lowSample || undefined} style={{ "--m-ink": "var(--status-interview)" }}>
                  <div className="meter__head">
                    <span className="meter__label">{row.label}</span>
                    <span className="segment-row__value">
                      {row.lowSample
                        ? `${row.total} sent · too few to judge`
                        : `${row.interviewRate}% interview · ${row.replyRate}% reply · ${row.total} sent`}
                    </span>
                  </div>
                  <div className="meter__track">
                    <div className="meter__fill" style={{ width: `${row.lowSample ? 0 : (row.interviewRate / maxSegmentRate) * 100}%` }} />
                  </div>
                </div>
              ))}
              {segmentRows.some((row) => row.lowSample) && (
                <p className="health-tile__note">Rates need at least {MIN_SAMPLE} applications before they mean much.</p>
              )}
            </SectionCard>

            <SectionCard title="Does Following Up Help?" subtitle="Only applications still unanswered after a week, split by whether you chased them.">
              {followUps.chased.total + followUps.left.total === 0 ? (
                <p className="muted-note">Nothing has waited a week without a reply in this range.</p>
              ) : (
                <>
                  {followUpGroups.map((group) => (
                    <div key={group.label} className="meter" style={{ "--m-ink": group.ink }}>
                      <div className="meter__head">
                        <span className="meter__label">{group.label}</span>
                        <span className="segment-row__value">
                          {group.total === 0 ? "none yet" : `${group.rate}% got a reply · ${group.replied} of ${group.total}`}
                        </span>
                      </div>
                      <div className="meter__track">
                        <div className="meter__fill" style={{ width: `${group.rate}%` }} />
                      </div>
                    </div>
                  ))}
                  <p className="health-tile__note">
                    {followUps.sentCount > 0
                      ? `${followUps.sentCount} follow-up${followUps.sentCount !== 1 ? "s" : ""} sent: ${followUps.channels.map((c) => `${c.count} by ${c.method}`).join(", ")}.`
                      : "No follow-ups logged as sent in this range."}
                    {(followUps.chased.total < 5 || followUps.left.total < 5) && " Treat this as a hint until each group has at least 5 applications."}
                  </p>
                </>
              )}
            </SectionCard>
          </div>

          <div className="dash-grid dash-grid--auto">
            <SectionCard title="Rejection by Stage" subtitle="Where rejections happen after application or interview.">
              {rejections.total === 0 ? (
                <p className="muted-note">No rejections logged in this range.</p>
              ) : rejections.stages.map((item) => (
                <div key={item.stage} className="meter" style={{ "--m-ink": item.stage === "No Interview" ? "var(--status-ghosted)" : "var(--status-rejected)" }}>
                  <div className="meter__head">
                    <span className="meter__label">{item.stage}</span>
                    <span className="segment-row__value">{item.count} ({item.pct}%)</span>
                  </div>
                  <div className="meter__track">
                    <div className="meter__fill" style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </SectionCard>

            <SectionCard title="Open Application Age" subtitle={`How long your ${data.openCount} open application${data.openCount !== 1 ? "s have" : " has"} been waiting, whatever the date range.`}>
              {data.openCount === 0 ? <p className="muted-note">Nothing is open right now.</p> : data.aging.map((bucket) => (
                <div key={bucket.label} className="meter" style={{ "--m-ink": AGE_TOKENS[bucket.tone] }}>
                  <div className="meter__head">
                    <span className="meter__label">{bucket.label}</span>
                    <span className="segment-row__value">{bucket.count} ({bucket.pct}%)</span>
                  </div>
                  <div className="meter__track">
                    <div className="meter__fill" style={{ width: `${bucket.pct}%` }} />
                  </div>
                </div>
              ))}
            </SectionCard>
          </div>
        </>
      )}

      {employment.secured.length > 0 && (
        <SectionCard
          title="Employment History"
          subtitle="Jobs you secured and how long you worked at each. Average time worked counts finished jobs only."
        >
          <div className="dash-grid dash-grid--tight">
            {[
              { label: "Current job", value: employment.current[0]?.company || "—", note: employment.current[0] ? `${formatTenure(employment.current[0].tenure)} so far` : employment.upcoming[0] ? `Next: ${employment.upcoming[0].company} from ${employment.upcoming[0].startDate}` : "Not currently in a tracked job." },
              { label: "Total time worked", value: formatTenure(employment.totalTenureDays), note: `Across ${employment.datedCount} job${employment.datedCount !== 1 ? "s" : ""} with dates.` },
              { label: "Avg time worked", value: formatTenure(employment.avgTenureDays), note: `${employment.finished.length} finished job${employment.finished.length !== 1 ? "s" : ""}.` },
              { label: "Avg search to secure", value: employment.avgDaysToSecure === null ? "—" : `${employment.avgDaysToSecure}d`, note: "From applying to securing the job." },
            ].map((item) => (
              <div key={item.label} className="health-tile" style={{ "--m-ink": "var(--status-secured)" }}>
                <div className="health-tile__value">{item.value}</div>
                <div className="health-tile__label">{item.label}</div>
                <div className="health-tile__note">{item.note}</div>
              </div>
            ))}
          </div>
          <div className="stack">
            {employment.secured.map((app) => {
              const pct = longestTenure > 0 && app.tenure !== null ? Math.max(2, Math.round((app.tenure / longestTenure) * 100)) : 0;
              const when = app.employment === "current" ? `since ${app.startDate}`
                : app.employment === "finished" ? `${app.startDate} → ${app.endDate}`
                : app.employment === "upcoming" ? `starts ${app.startDate}` : "add a start date";
              return (
                <div key={app.id} className="meter" style={{ "--m-ink": "var(--status-secured)" }}>
                  <div className="meter__head">
                    <span className="meter__label">{app.company}{app.role ? ` · ${app.role}` : ""}{app.employment === "current" ? " (current)" : ""}</span>
                    <span className="meter__value">{app.tenure === null ? "—" : formatTenure(app.tenure)} · {when}</span>
                  </div>
                  <div className="meter__track">
                    <div className="meter__fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
    </>
  );
}
