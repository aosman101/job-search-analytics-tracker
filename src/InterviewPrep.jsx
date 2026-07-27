import { useCallback, useMemo, useRef, useState } from "react";
import prepData from "./data/interview-prep.json";

// ---------------------------------------------------------------------------
// All prep content lives in src/data/interview-prep.json so answers can be
// edited without touching component code.
// ---------------------------------------------------------------------------

const { profile: PROFILE, keyNumbers: KEY_NUMBERS, coreTips: CORE_TIPS, stagePlaybook: STAGE_PLAYBOOK, questions: QUESTIONS, projects: PROJECTS } = prepData;

const QUESTIONS_BY_ID = new Map(QUESTIONS.map(q => [q.id, q]));
const CATEGORIES = [...new Set(QUESTIONS.map(q => q.category))];

const ROLE_TYPES = {
  DE: { label: "Data Engineering", short: "DE" },
  DA: { label: "Data Analysis", short: "DA" },
  AE: { label: "Analytics Engineering", short: "AE" },
};

const ROLE_PATTERNS = {
  DE: [/data\s*engineer/i, /etl/i, /pipeline/i, /platform\s*engineer/i, /infra.*data/i, /big\s*data/i, /backend.*data/i],
  DA: [/data\s*analyst/i, /business\s*analyst/i, /bi\s*analyst/i, /reporting/i, /business\s*intelligence/i, /insights/i],
  AE: [/analytics\s*engineer/i, /dbt/i, /analytic.*engineer/i],
};

const SECTIONS = [
  { id: "interviews", label: "Your Interviews", hint: "Stage tips & core principles" },
  { id: "qa", label: "Q&A", hint: `${QUESTIONS.length} answers, in your words` },
  { id: "evidence", label: "Your Evidence", hint: "Numbers, roles & projects" },
];

function detectRoleType(roleTitle) {
  if (!roleTitle) return null;
  for (const [type, patterns] of Object.entries(ROLE_PATTERNS)) {
    if (patterns.some(p => p.test(roleTitle))) return type;
  }
  return null;
}

function getActiveInterviews(apps) {
  return apps
    .filter(a => a.status === "Interview" || (a.interviewStage && !["Rejected", "Withdrawn", "Ghosted"].includes(a.status)))
    .map(a => ({ ...a, detectedRole: detectRoleType(a.role) }));
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

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

function QuestionCard({ item, open, onToggle, cardRef }) {
  const [copied, setCopied] = useState(false);

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(`${item.question}\n\n${item.answer}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {
      // Clipboard access can be blocked; failing silently is fine here.
    }
  }

  return (
    <article className="prep-qa" data-open={open} ref={cardRef}>
      <button className="prep-qa__toggle" onClick={onToggle} aria-expanded={open}>
        <span>
          <span className="prep-qa__question">{item.question}</span>
          <span className="prep-qa__meta">
            <span className="prep-tag prep-tag--accent">{item.category}</span>
            {item.roles.length < 3 && item.roles.map(r => (
              <span key={r} className="prep-tag">{ROLE_TYPES[r]?.short || r}</span>
            ))}
          </span>
        </span>
        <span className="prep-qa__caret" aria-hidden="true">▼</span>
      </button>

      {open && (
        <div className="prep-qa__body">
          <p className="prep-qa__answer">{item.answer}</p>

          <div className="prep-steps" style={{ marginTop: 16 }}>
            {item.structure.map((step, i) => (
              <span key={step} className="prep-step">
                <span className="prep-step__index">{i + 1}</span>
                {step}
              </span>
            ))}
          </div>

          <div className="prep-qa__grid">
            <div className="prep-panel prep-panel--evidence">
              <div className="prep-panel__label">Your evidence</div>
              <p className="prep-panel__text">{item.evidence}</p>
            </div>
            <div className="prep-panel prep-panel--watch">
              <div className="prep-panel__label">Watch out</div>
              <p className="prep-panel__text">{item.watchOut}</p>
            </div>
          </div>

          <button className="prep-copy" onClick={copyAnswer}>
            {copied ? "Copied ✓" : "Copy answer"}
          </button>
        </div>
      )}
    </article>
  );
}

function StagePlaybookCard({ stage, onOpenQuestion }) {
  return (
    <div className={`prep-stage prep-stage--${stage.accent}`}>
      <div className="prep-stage__head">
        <h4 className="prep-stage__title">{stage.emoji} {stage.stage}</h4>
        <span className="prep-stage__focus">{stage.focus}</span>
      </div>
      <ul className="prep-stage__tips">
        {stage.tips.map(tip => <li key={tip}>{tip}</li>)}
      </ul>
      <div className="prep-panel__label">Rehearse these</div>
      <div className="prep-steps" style={{ marginTop: 8 }}>
        {stage.questions.map(id => {
          const q = QUESTIONS_BY_ID.get(id);
          if (!q) return null;
          return (
            <button key={id} className="prep-chip" onClick={() => onOpenQuestion(id)}>
              {q.question}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectCard({ project }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="prep-project">
      <button className="prep-project__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }} aria-hidden="true">{project.emoji}</span>
          <span>
            <span className="prep-project__name">{project.name}</span>
            <span className="prep-project__category" style={{ display: "block" }}>{project.category}</span>
          </span>
        </span>
        <span className="prep-qa__caret" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none" }}>▼</span>
      </button>
      {open && (
        <div className="prep-project__body">
          <p className="prep-project__summary">{project.summary}</p>
          <div className="prep-panel__label">Talking points</div>
          <ul className="prep-points" style={{ marginTop: 8 }}>
            {project.interviewUse.map(point => <li key={point}>{point}</li>)}
          </ul>
          <div className="prep-panel__label">Stack</div>
          <div className="prep-steps" style={{ marginTop: 8, marginBottom: 14 }}>
            {project.stack.map(tech => <span key={tech} className="prep-step">{tech}</span>)}
          </div>
          <a className="prep-link" href={project.github} target="_blank" rel="noopener noreferrer">
            View on GitHub ↗
          </a>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function InterviewPrep({ apps = [] }) {
  const [section, setSection] = useState("interviews");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [openIds, setOpenIds] = useState(() => new Set());
  const pendingFocus = useRef(null);

  const activeInterviews = useMemo(() => getActiveInterviews(apps), [apps]);

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return QUESTIONS.filter(q => {
      if (category !== "all" && q.category !== category) return false;
      if (!term) return true;
      return (
        q.question.toLowerCase().includes(term) ||
        q.answer.toLowerCase().includes(term) ||
        q.evidence.toLowerCase().includes(term) ||
        q.category.toLowerCase().includes(term)
      );
    });
  }, [search, category]);

  const toggleQuestion = useCallback(id => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Jumping from a stage playbook shortcut into the Q&A tab: clear any filters
  // that would hide the target, open it, then scroll it into view once mounted.
  const openQuestion = useCallback(id => {
    setSection("qa");
    setSearch("");
    setCategory("all");
    setOpenIds(prev => new Set(prev).add(id));
    pendingFocus.current = id;
  }, []);

  const registerCard = useCallback(id => node => {
    if (node && pendingFocus.current === id) {
      pendingFocus.current = null;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const stagesInPlay = useMemo(() => {
    const stages = new Set(activeInterviews.map(a => a.interviewStage).filter(Boolean));
    return STAGE_PLAYBOOK.filter(s => stages.has(s.stage));
  }, [activeInterviews]);

  const headlineProjects = PROJECTS.filter(p => p.tier === "headline");
  const supportingProjects = PROJECTS.filter(p => p.tier !== "headline");

  return (
    <>
      <div className="prep-nav" role="tablist" aria-label="Interview prep sections">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            role="tab"
            aria-selected={section === s.id}
            className="prep-nav__item"
            onClick={() => setSection(s.id)}
          >
            {s.label}
            <span className="prep-nav__count">{s.hint}</span>
          </button>
        ))}
      </div>

      {/* ------------------------------------------------ Your Interviews -- */}
      {section === "interviews" && (
        <>
          {activeInterviews.length > 0 ? (
            <>
              <p className="prep-lede">
                {activeInterviews.length} application{activeInterviews.length !== 1 ? "s" : ""} in your pipeline
                {activeInterviews.length !== 1 ? " have" : " has"} interview activity. Prep below is matched to the stage each one has reached.
              </p>
              {activeInterviews.map(app => {
                const stage = STAGE_PLAYBOOK.find(s => s.stage === app.interviewStage);
                const roleLabel = app.detectedRole ? ROLE_TYPES[app.detectedRole].label : "General prep";
                return (
                  <div className="prep-interview" key={app.id}>
                    <div className="prep-interview__head">
                      <h3 className="prep-interview__company">{app.company}</h3>
                      <span className="prep-interview__role">{app.role}</span>
                      <span className="prep-tag prep-tag--accent">{roleLabel}</span>
                    </div>
                    {stage ? (
                      <StagePlaybookCard stage={stage} onOpenQuestion={openQuestion} />
                    ) : (
                      <p className="prep-lede" style={{ marginBottom: 0 }}>
                        No interview stage recorded yet. Set one on the application to get stage-specific prep, or use the core principles below.
                      </p>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <div className="prep-empty" style={{ marginBottom: 22 }}>
              No interviews in play right now. When an application reaches an interview stage, its prep appears here automatically.
            </div>
          )}

          <h3 className="prep-section-heading">Core principles</h3>
          <p className="prep-lede">
            Six things that apply in every round, drawn from the evidence you actually have.
          </p>
          <div className="prep-tip-grid">
            {CORE_TIPS.map(tip => (
              <div className="prep-tip" key={tip.title}>
                <p className="prep-tip__title">{tip.title}</p>
                <p className="prep-tip__body">{tip.body}</p>
              </div>
            ))}
          </div>

          <h3 className="prep-section-heading">
            {stagesInPlay.length > 0 ? "Every other stage" : "Stage playbook"}
          </h3>
          <p className="prep-lede">
            What each round is really testing, and the questions to rehearse before it.
          </p>
          {STAGE_PLAYBOOK.filter(s => !stagesInPlay.includes(s)).map(stage => (
            <StagePlaybookCard key={stage.stage} stage={stage} onOpenQuestion={openQuestion} />
          ))}
        </>
      )}

      {/* -------------------------------------------------------------- Q&A -- */}
      {section === "qa" && (
        <>
          <p className="prep-lede">
            {QUESTIONS.length} questions with answers written the way you would actually say them, each anchored to real
            work. Answer out loud first, then open the card and compare.
          </p>

          <div className="prep-toolbar">
            <input
              className="prep-search"
              type="search"
              placeholder="Search questions and answers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search interview questions"
            />
            <button
              className="prep-chip"
              onClick={() => setOpenIds(openIds.size ? new Set() : new Set(filteredQuestions.map(q => q.id)))}
            >
              {openIds.size ? "Collapse all" : "Expand all"}
            </button>
          </div>

          <div className="prep-filters">
            <button className="prep-chip" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
              All ({QUESTIONS.length})
            </button>
            {CATEGORIES.map(cat => (
              <button key={cat} className="prep-chip" aria-pressed={category === cat} onClick={() => setCategory(cat)}>
                {cat} ({QUESTIONS.filter(q => q.category === cat).length})
              </button>
            ))}
          </div>

          {filteredQuestions.length > 0 ? (
            <div className="prep-qa-list">
              {filteredQuestions.map(item => (
                <QuestionCard
                  key={item.id}
                  item={item}
                  open={openIds.has(item.id)}
                  onToggle={() => toggleQuestion(item.id)}
                  cardRef={registerCard(item.id)}
                />
              ))}
            </div>
          ) : (
            <div className="prep-empty">No questions match “{search}”. Try a different term or clear the category filter.</div>
          )}
        </>
      )}

      {/* --------------------------------------------------- Your Evidence -- */}
      {section === "evidence" && (
        <>
          <SectionCard
            title="Elevator pitch"
            subtitle="Thirty seconds. Know it well enough to vary it — swap the closing line for something specific to the company."
            style={{ marginBottom: 16 }}
          >
            <p className="prep-pitch">{PROFILE.elevatorPitch}</p>
          </SectionCard>

          <h3 className="prep-section-heading">Numbers to have ready</h3>
          <p className="prep-lede">
            These are the figures that make your answers land. Know them without hesitating.
          </p>
          <div className="prep-number-grid" style={{ marginBottom: 8 }}>
            {KEY_NUMBERS.map(n => (
              <div className="prep-number" key={n.label}>
                <div className="prep-number__value">{n.value}</div>
                <div className="prep-number__label">{n.label}</div>
                <div className="prep-number__detail">{n.detail}</div>
              </div>
            ))}
          </div>

          <h3 className="prep-section-heading">Experience</h3>
          {PROFILE.workExperience.map(job => (
            <div className="prep-role" key={`${job.company}-${job.role}`}>
              <div className="prep-role__head">
                <div>
                  <div className="prep-role__title">{job.role}</div>
                  <div className="prep-role__org">{job.company} · {job.location}</div>
                </div>
                <span className="prep-role__period">{job.period}</span>
              </div>
              <ul className="prep-role__points">
                {job.highlights.map(h => <li key={h}>{h}</li>)}
              </ul>
            </div>
          ))}

          <h3 className="prep-section-heading">Projects to lead with</h3>
          <p className="prep-lede">
            Reach for these four first — they cover streaming, batch orchestration, modelling, and real user impact between them.
          </p>
          {headlineProjects.map(p => <ProjectCard key={p.id} project={p} />)}

          <h3 className="prep-section-heading">Further depth</h3>
          <p className="prep-lede">
            Useful when a question calls for something specific, but do not volunteer all of these unprompted.
          </p>
          {supportingProjects.map(p => <ProjectCard key={p.id} project={p} />)}

          <h3 className="prep-section-heading">Stack &amp; links</h3>
          <SectionCard
            title="Technical stack"
            subtitle="Asked what you work with? Lead with Python and SQL, then dbt and Airflow, then the databases, then streaming."
            style={{ marginBottom: 12 }}
          >
            <div className="prep-steps">
              {PROFILE.coreSkills.map(skill => <span key={skill} className="prep-step">{skill}</span>)}
            </div>
          </SectionCard>

          <SectionCard title="Share these" subtitle="Have them ready to drop into a chat window or a follow-up email.">
            <div className="prep-link-row">
              <a className="prep-link" href={PROFILE.links.github} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
              <a className="prep-link" href={PROFILE.links.portfolio} target="_blank" rel="noopener noreferrer">Portfolio ↗</a>
              <a className="prep-link" href={PROFILE.links.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>
            </div>
          </SectionCard>
        </>
      )}
    </>
  );
}
