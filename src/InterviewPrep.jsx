import { useState, useMemo } from "react";
import interviewPrepData from "./data/interview-prep.json";

// ---------------------------------------------------------------------------
// Personal profile, projects, and tailored answers — sourced from
// src/data/interview-prep.json so content edits don't require code changes.
// ---------------------------------------------------------------------------

const MY_PROFILE = interviewPrepData.profile;
const MY_PROJECTS = interviewPrepData.projects;
const TAILORED_ANSWERS = interviewPrepData.tailoredAnswers;


// ---------------------------------------------------------------------------
// Study guide content — structured by domain and topic
// ---------------------------------------------------------------------------

const ROLE_TYPES = {
  DE: { label: "Data Engineering", color: "#3B82F6", bg: "#EFF6FF", border: "#BFDBFE", emoji: "🔧" },
  DA: { label: "Data Analysis", color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", emoji: "📈" },
  AE: { label: "Analytics Engineering", color: "#8B5CF6", bg: "#F5F3FF", border: "#DDD6FE", emoji: "🔬" },
};

const STAGE_GUIDANCE = {
  "1st Interview": {
    label: "1st Interview",
    emoji: "👋",
    color: "#3B82F6",
    focus: "Introduction & Screening",
    tips: [
      "Prepare a concise 2-minute walkthrough of your career narrative — focus on transitions and why each move made sense.",
      "Research the company's data stack and recent engineering blog posts. Mentioning specifics shows genuine interest.",
      "Have 3-4 thoughtful questions ready about team structure, data challenges, and tech stack evolution.",
      "Expect high-level technical screening: SQL fundamentals, basic Python, and 'tell me about a project' style questions.",
      "Be ready to explain your understanding of the role and why it excites you — interviewers filter for enthusiasm here.",
    ],
  },
  "2nd Interview": {
    label: "2nd Interview",
    emoji: "🔍",
    color: "#8B5CF6",
    focus: "Deep Technical Assessment",
    tips: [
      "Expect live coding or whiteboard problems. Practice thinking out loud — narrate your approach before writing code.",
      "For SQL: window functions, self-joins, CTEs, and query optimization will almost certainly come up.",
      "For Python: be fluent with pandas operations, dictionary comprehensions, and basic algorithm patterns.",
      "Prepare to discuss trade-offs in past technical decisions — 'why did you choose X over Y' is a favourite.",
      "If asked about system design, clarify requirements and constraints before jumping into architecture.",
    ],
  },
  "3rd Interview": {
    label: "3rd Interview",
    emoji: "🧪",
    color: "#EC4899",
    focus: "Advanced Technical & Cross-functional",
    tips: [
      "This round often tests breadth — expect questions that cross domains (e.g., data quality + stakeholder communication).",
      "Be ready for scenario-based questions: 'How would you handle a pipeline that breaks at 2am before a board meeting?'",
      "Demonstrate ownership mentality — talk about times you went beyond your defined role to solve problems.",
      "If meeting senior engineers or architects, focus on system-level thinking and long-term maintainability.",
      "Prepare examples of cross-team collaboration and how you resolved technical disagreements.",
    ],
  },
  "Home Assignment": {
    label: "Home Assignment",
    emoji: "🏠",
    color: "#F59E0B",
    focus: "Take-Home Project Execution",
    tips: [
      "Read the brief twice. Underline every requirement. Missing a stated requirement is the #1 reason candidates fail take-homes.",
      "Structure your submission: README with approach, assumptions, and how to run it. Clean code > clever code.",
      "Time-box yourself. If the brief says 3-4 hours, spend 3-4 hours. Over-engineering signals poor prioritisation.",
      "Include tests for critical logic — even a few well-chosen tests show engineering maturity.",
      "Add a brief 'What I would do next' section to show you can think beyond the immediate ask.",
      "For data tasks: document your data quality assumptions and how you handled edge cases (nulls, duplicates, malformed rows).",
    ],
  },
  "Final Interview": {
    label: "Final Interview",
    emoji: "🏆",
    color: "#10B981",
    focus: "Culture Fit & Leadership Alignment",
    tips: [
      "This is often with a hiring manager or director. Shift from 'I can do the work' to 'I'm the right person for this team'.",
      "Prepare questions about team vision, growth plans, and how success is measured in the first 6 months.",
      "Have a clear, honest answer for compensation expectations — research market rates beforehand.",
      "Revisit your notes from earlier rounds. Reference specific conversations to show continuity and attention.",
      "Ask about the decision timeline so you can plan your follow-up appropriately.",
      "Be yourself — at this stage they've validated your skills. This round is about fit and mutual enthusiasm.",
    ],
  },
};

const STUDY_GUIDE = [
  {
    id: "sql",
    title: "SQL",
    emoji: "🗄️",
    color: "#3B82F6",
    roles: ["DE", "DA", "AE"],
    description: "The universal language of data — tested in almost every data interview.",
    topics: [
      {
        name: "Window Functions",
        importance: "high",
        concepts: ["ROW_NUMBER, RANK, DENSE_RANK", "LAG/LEAD for row comparisons", "Running totals with SUM() OVER", "PARTITION BY vs GROUP BY", "Frame clauses: ROWS BETWEEN"],
        exampleQuestions: [
          "Find the second highest salary in each department.",
          "Calculate a 7-day rolling average of daily revenue.",
          "Identify consecutive login streaks per user.",
        ],
        tips: "Window functions are the #1 most tested SQL concept. Practice until they feel natural. Always clarify the partition and ordering before writing. Your F1 RaceOps project uses window functions for ranking drivers and pit stop performance — reference it.",
      },
      {
        name: "CTEs & Subqueries",
        importance: "high",
        concepts: ["WITH clause for readability", "Recursive CTEs for hierarchical data", "Correlated vs non-correlated subqueries", "When to use CTEs vs temp tables vs subqueries"],
        exampleQuestions: [
          "Build an org chart query using recursive CTE.",
          "Find customers whose first purchase was above average.",
          "Chain multiple CTEs to build a funnel analysis.",
        ],
        tips: "CTEs make your thinking visible to the interviewer. Use them liberally — they show you write maintainable SQL. Your dbt models (F1 RaceOps, Premier League) are essentially CTEs made permanent — mention this to show you think in layers.",
      },
      {
        name: "Query Optimisation",
        importance: "medium",
        concepts: ["Reading EXPLAIN plans", "Indexing strategies (B-tree, hash, composite)", "Avoiding SELECT * and unnecessary joins", "Partition pruning in large tables", "Understanding query execution order"],
        exampleQuestions: [
          "This query runs in 45 seconds. How would you diagnose and improve it?",
          "When would you choose a composite index over separate indexes?",
          "Explain the difference between a hash join and a nested loop join.",
        ],
        tips: "You won't always be asked to optimise, but understanding why a query is slow signals senior-level thinking. Reference your BigQuery cost optimisation experience from the Premier League warehouse.",
      },
      {
        name: "Data Modeling",
        importance: "high",
        concepts: ["Star schema vs snowflake schema", "Fact vs dimension tables", "Slowly changing dimensions (SCD Types 1, 2, 3)", "Normalisation forms (1NF through 3NF)", "Surrogate keys vs natural keys"],
        exampleQuestions: [
          "Design a schema for an e-commerce order system.",
          "How would you handle a customer who changes their address over time?",
          "When is denormalisation the right choice?",
        ],
        tips: "Data modeling questions test how you think about data relationships. Start with entities and relationships before jumping to tables. Your F1 RaceOps star schema (9 dims + facts) and StreamShop SCD2 implementation are strong examples to reference.",
      },
      {
        name: "Joins & Set Operations",
        importance: "medium",
        concepts: ["INNER, LEFT, RIGHT, FULL OUTER, CROSS", "Self-joins for comparing rows in the same table", "Anti-joins (LEFT JOIN WHERE NULL)", "UNION vs UNION ALL vs INTERSECT vs EXCEPT"],
        exampleQuestions: [
          "Find customers who placed orders but never made a return.",
          "Compare each employee's salary to their manager's salary.",
          "Combine data from two tables with different schemas.",
        ],
        tips: "Draw the Venn diagram in your head (or on paper). Clarify expected behaviour for NULLs in join keys.",
      },
    ],
  },
  {
    id: "python",
    title: "Python",
    emoji: "🐍",
    color: "#10B981",
    roles: ["DE", "DA", "AE"],
    description: "The Swiss army knife for data work — from scripting to full pipeline orchestration.",
    topics: [
      {
        name: "Pandas & Data Manipulation",
        importance: "high",
        concepts: ["GroupBy, agg, transform, apply", "Merge/join strategies and indicator flags", "Pivot tables and melt/unpivot", "Handling missing data (fillna, dropna, interpolate)", "Method chaining for readable pipelines"],
        exampleQuestions: [
          "Given a DataFrame of sales, find the top 3 products per region by revenue.",
          "Clean and reshape a messy CSV with inconsistent date formats and missing values.",
          "Calculate month-over-month growth rates from a time series DataFrame.",
        ],
        tips: "Pandas is tested practically. Speed matters less than correctness and clean code. Use .pipe() for readable chains. Your Deep Stock Insights project uses heavy pandas for 18+ technical indicators — great example of real-world data manipulation.",
      },
      {
        name: "Data Structures & Algorithms",
        importance: "medium",
        concepts: ["Dictionaries and defaultdict for aggregation", "Sets for fast lookups and deduplication", "List comprehensions and generator expressions", "Sorting with key functions and lambda", "Collections module (Counter, deque, OrderedDict)"],
        exampleQuestions: [
          "Find the most frequently occurring element in a list.",
          "Deduplicate a list of records while preserving order.",
          "Implement a simple LRU cache.",
        ],
        tips: "Data roles rarely get LeetCode hard problems. Focus on hash maps, sorting, and string manipulation — they cover 80% of what you'll see.",
      },
      {
        name: "File I/O & APIs",
        importance: "medium",
        concepts: ["Reading CSV, JSON, Parquet files", "Working with APIs using requests", "Pagination handling and rate limiting", "Context managers for safe file handling", "Error handling and retry patterns"],
        exampleQuestions: [
          "Write a script to pull paginated data from a REST API and save to Parquet.",
          "How would you handle a flaky API that occasionally returns 500 errors?",
          "Parse a nested JSON response into a flat DataFrame.",
        ],
        tips: "Real-world data ingestion is messy. Showing you handle edge cases (timeouts, malformed data, encoding issues) is a strong signal. Your TfL and London Air Quality projects both pull from live APIs with error handling — reference these.",
      },
      {
        name: "Testing & Code Quality",
        importance: "low",
        concepts: ["pytest basics and fixture patterns", "Assertion strategies for DataFrames", "Mocking external dependencies", "Type hints for function signatures", "Linting and formatting (black, ruff)"],
        exampleQuestions: [
          "How would you test a data transformation function?",
          "What's your approach to testing a pipeline that depends on an external API?",
        ],
        tips: "Testing rarely dominates an interview, but mentioning it proactively shows maturity. 'I'd write a test for this' is always a good reflex.",
      },
    ],
  },
  {
    id: "system-design",
    title: "System Design",
    emoji: "🏗️",
    color: "#F59E0B",
    roles: ["DE", "AE"],
    description: "Designing scalable data systems — pipelines, warehouses, and real-time architectures.",
    topics: [
      {
        name: "Pipeline Architecture",
        importance: "high",
        concepts: ["ETL vs ELT and when to use each", "Batch vs streaming vs micro-batch", "Idempotency and exactly-once processing", "Orchestration (Airflow, Dagster, Prefect)", "Data lake vs data warehouse vs lakehouse"],
        exampleQuestions: [
          "Design a pipeline to ingest clickstream data from a web app into a data warehouse.",
          "How would you handle late-arriving data in a daily batch pipeline?",
          "Compare Airflow and Dagster — when would you choose one over the other?",
        ],
        tips: "Always start with: What's the source? What's the destination? What's the SLA? What's the volume? These four questions frame everything. You've built both batch (TfL, London Air Quality) and streaming (StreamShop CDC) pipelines — use them as contrasting examples.",
      },
      {
        name: "Data Warehousing",
        importance: "high",
        concepts: ["Kimball vs Inmon methodology", "Partitioning and clustering strategies", "Materialised views and incremental models", "Cost optimisation in cloud warehouses", "Data freshness vs compute cost trade-offs"],
        exampleQuestions: [
          "Design a warehouse schema for a SaaS product with subscriptions, usage, and billing.",
          "How would you optimise a Snowflake/BigQuery warehouse that's costing too much?",
          "Explain how you'd implement incremental loading for a fact table.",
        ],
        tips: "Warehouse design questions are really about trade-offs. There's no single right answer — show your reasoning process. Reference your Premier League BigQuery warehouse for cloud and F1 RaceOps PostgreSQL warehouse for local — you've done both.",
      },
      {
        name: "Streaming & Real-Time",
        importance: "medium",
        concepts: ["Kafka fundamentals (topics, partitions, consumer groups)", "Event-driven architecture patterns", "Stream processing (Flink, Spark Streaming)", "Exactly-once vs at-least-once semantics", "Windowing strategies (tumbling, sliding, session)"],
        exampleQuestions: [
          "Design a real-time fraud detection system.",
          "How would you handle out-of-order events in a streaming pipeline?",
          "When is streaming overkill and batch is the right answer?",
        ],
        tips: "Most companies don't need real-time everything. Showing you can identify when streaming is warranted (and when it's not) is a strong signal. Your StreamShop CDC project (Debezium → Redpanda → ClickHouse) is your go-to streaming example.",
      },
      {
        name: "Data Quality & Observability",
        importance: "medium",
        concepts: ["Data contracts and schema evolution", "Freshness, volume, and distribution checks", "Great Expectations / dbt tests / Soda", "Alerting and incident response for data pipelines", "Lineage tracking and impact analysis"],
        exampleQuestions: [
          "How would you detect and handle a schema change from an upstream API?",
          "Design a data quality monitoring system for a critical dashboard.",
          "Walk me through how you'd investigate a data discrepancy reported by a stakeholder.",
        ],
        tips: "Data quality is increasingly a first-class interview topic. Having concrete examples of quality issues you caught and fixed is very valuable. You use Great Expectations in TfL + London Air Quality, dbt tests across all projects, Avro schema validation in StreamShop, and OpenLineage for lineage.",
      },
    ],
  },
  {
    id: "behavioral",
    title: "Behavioral",
    emoji: "🤝",
    color: "#EC4899",
    roles: ["DE", "DA", "AE"],
    description: "How you work with people, handle ambiguity, and grow through challenges.",
    topics: [
      {
        name: "STAR Method",
        importance: "high",
        concepts: ["Situation — set the scene concisely", "Task — what was your specific responsibility", "Action — what YOU did (not the team)", "Result — quantify the outcome where possible", "Keep it under 2 minutes per answer"],
        exampleQuestions: [
          "Tell me about a time you had to deal with ambiguous requirements.",
          "Describe a situation where you disagreed with a teammate's technical approach.",
          "Give an example of a project where you had to learn something new quickly.",
        ],
        tips: "Prepare 5-6 strong stories that can be adapted to different questions. Each story should have a clear conflict and resolution. Your stories: StreamShop (technical complexity), TfL (learning new tools), AI Trading Agent (learning fast), Premier League (cost trade-offs), F1 (data modelling decisions).",
      },
      {
        name: "Stakeholder Communication",
        importance: "high",
        concepts: ["Translating technical concepts for non-technical audiences", "Managing expectations and saying no constructively", "Presenting data findings and recommendations", "Handling conflicting priorities from different teams", "Written communication (docs, Slack, emails)"],
        exampleQuestions: [
          "How do you explain a complex data issue to a non-technical stakeholder?",
          "Tell me about a time a stakeholder asked for something you knew was wrong. What did you do?",
          "How do you prioritise when multiple teams need your help?",
        ],
        tips: "Data roles are cross-functional by nature. Interviewers want to know you can bridge the gap between technical work and business impact.",
      },
      {
        name: "Problem-Solving & Ownership",
        importance: "medium",
        concepts: ["Root cause analysis mindset", "Taking initiative beyond your job description", "Learning from failures and post-mortems", "Working under pressure with tight deadlines", "Making decisions with incomplete information"],
        exampleQuestions: [
          "Tell me about a time you identified a problem nobody else noticed.",
          "Describe a project that failed. What did you learn?",
          "How do you handle a situation where you're blocked and your manager is unavailable?",
        ],
        tips: "Ownership stories are gold. 'I noticed X was broken, I fixed it, here's the impact' is the formula interviewers love.",
      },
    ],
  },
  {
    id: "de-specific",
    title: "Data Engineering",
    emoji: "🔧",
    color: "#3B82F6",
    roles: ["DE"],
    description: "Deep-dive topics specific to data engineering roles.",
    topics: [
      {
        name: "Spark & Distributed Computing",
        importance: "high",
        concepts: ["RDDs vs DataFrames vs Datasets", "Partitioning and shuffles", "Broadcast joins for small tables", "Catalyst optimiser and execution plans", "Memory management and spill-to-disk"],
        exampleQuestions: [
          "Your Spark job is running out of memory. How do you diagnose and fix it?",
          "When would you use a broadcast join vs a sort-merge join?",
          "Explain the difference between narrow and wide transformations.",
        ],
        tips: "You don't need to memorise Spark internals, but understanding partitioning, shuffles, and joins at a conceptual level is expected for DE roles.",
      },
      {
        name: "Orchestration & Infrastructure",
        importance: "high",
        concepts: ["Airflow DAGs, operators, and sensors", "Idempotent task design", "Infrastructure as code (Terraform, CloudFormation)", "Containerisation (Docker) for reproducible environments", "CI/CD for data pipelines"],
        exampleQuestions: [
          "How do you handle a failed Airflow task at 3am?",
          "Design a CI/CD pipeline for a dbt project.",
          "When would you choose Kubernetes over a managed service?",
        ],
        tips: "Orchestration is the backbone of DE work. Show you understand not just how to build pipelines, but how to operate them reliably. You've built Airflow DAGs in TfL Lakehouse and London Air Quality, plus CI/CD with GitHub Actions across multiple projects — reference these.",
      },
      {
        name: "Cloud Platforms",
        importance: "medium",
        concepts: ["AWS (S3, Glue, Redshift, EMR, Lambda)", "GCP (GCS, BigQuery, Dataflow, Composer)", "Azure (ADLS, Synapse, Data Factory)", "Serverless vs managed vs self-hosted trade-offs", "Cost management and resource right-sizing"],
        exampleQuestions: [
          "Compare Redshift vs BigQuery for a mid-size analytics workload.",
          "How would you design a cost-efficient data lake on AWS?",
          "When does serverless make sense for data processing?",
        ],
        tips: "Know one cloud well and have awareness of the others. Most interviewers care more about your reasoning than platform-specific knowledge.",
      },
    ],
  },
  {
    id: "da-specific",
    title: "Data Analysis",
    emoji: "📈",
    color: "#10B981",
    roles: ["DA"],
    description: "Deep-dive topics specific to data analysis roles.",
    topics: [
      {
        name: "Statistics & A/B Testing",
        importance: "high",
        concepts: ["Hypothesis testing (p-values, significance levels)", "Confidence intervals and sample size calculation", "Common pitfalls (peeking, multiple comparisons, Simpson's paradox)", "Bayesian vs frequentist approaches", "Practical significance vs statistical significance"],
        exampleQuestions: [
          "You run an A/B test and the p-value is 0.06. What do you do?",
          "How would you calculate the required sample size for a pricing experiment?",
          "A metric improved in every segment but declined overall. How is that possible?",
        ],
        tips: "Interviewers test whether you understand statistics conceptually, not just formulaically. Be ready to explain trade-offs in plain language.",
      },
      {
        name: "Dashboarding & Visualisation",
        importance: "medium",
        concepts: ["Choosing the right chart type for the data", "Dashboard design principles (hierarchy, context, actionability)", "Tools: Tableau, Looker, Power BI, Metabase", "Avoiding misleading visualisations", "Self-serve analytics and metric definitions"],
        exampleQuestions: [
          "A stakeholder asks for a dashboard. Walk me through your process from request to delivery.",
          "How do you decide what belongs on a dashboard vs what's better as an ad-hoc analysis?",
          "Show me a dashboard you've built and explain your design choices.",
        ],
        tips: "Great dashboards answer one question clearly. Mentioning that you start with the business question (not the data) sets you apart.",
      },
      {
        name: "Business Acumen & Metrics",
        importance: "high",
        concepts: ["Defining and decomposing KPIs", "Funnel analysis and conversion metrics", "Cohort analysis and retention curves", "Revenue metrics (ARR, MRR, LTV, CAC)", "Root cause analysis frameworks"],
        exampleQuestions: [
          "Revenue dropped 15% this month. Walk me through how you'd investigate.",
          "Define the key metrics you'd track for a subscription product.",
          "How would you measure the success of a new feature launch?",
        ],
        tips: "Analysis roles are about impact, not just SQL. Frame every answer around: what's the business question, what did I find, what did we do about it.",
      },
    ],
  },
  {
    id: "ae-specific",
    title: "Analytics Engineering",
    emoji: "🔬",
    color: "#8B5CF6",
    roles: ["AE"],
    description: "Deep-dive topics specific to analytics engineering roles.",
    topics: [
      {
        name: "dbt & Transformation Layer",
        importance: "high",
        concepts: ["Models: staging, intermediate, marts", "Materialisation strategies (view, table, incremental, ephemeral)", "Jinja templating and macros", "Sources, refs, and the DAG", "Packages and reusable logic"],
        exampleQuestions: [
          "Walk me through how you'd structure a dbt project from scratch.",
          "When would you choose incremental over full-refresh materialisation?",
          "How do you handle a complex business rule that appears in multiple models?",
        ],
        tips: "dbt is the defining tool of analytics engineering. If the role mentions dbt, expect deep questions. Practice building a small project end-to-end.",
      },
      {
        name: "Data Modeling for Analytics",
        importance: "high",
        concepts: ["Wide (OBT) vs normalised models for BI", "Metric definitions and the metrics layer", "Slowly changing dimensions in practice", "Naming conventions and self-documenting models", "Bridging raw data and analyst-friendly marts"],
        exampleQuestions: [
          "Design a data model for a multi-product SaaS company's analytics layer.",
          "How do you decide what goes in a staging model vs a mart?",
          "What's your approach to defining metrics consistently across an organisation?",
        ],
        tips: "AE is about making data accessible and trustworthy. Show that you think about the analyst's experience, not just technical correctness.",
      },
      {
        name: "Testing & Data Quality",
        importance: "high",
        concepts: ["dbt tests (unique, not_null, accepted_values, relationships)", "Custom schema tests and generic tests", "Data freshness monitoring", "Documentation and cataloguing (dbt docs, data dictionaries)", "CI/CD for dbt (slim CI, state comparison)"],
        exampleQuestions: [
          "How do you test a dbt model that implements complex business logic?",
          "Design a data quality strategy for a team of 5 analysts consuming your models.",
          "What's your approach to dbt CI — what do you test on every PR?",
        ],
        tips: "Testing is core to AE, not an afterthought. Interviewers want to hear that quality is built into your workflow, not bolted on.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Role detection from application role titles
// ---------------------------------------------------------------------------

const ROLE_PATTERNS = {
  DE: [/data\s*engineer/i, /etl/i, /pipeline/i, /platform\s*engineer/i, /infra.*data/i, /big\s*data/i, /backend.*data/i],
  DA: [/data\s*analyst/i, /business\s*analyst/i, /bi\s*analyst/i, /reporting/i, /business\s*intelligence/i, /insights/i],
  AE: [/analytics\s*engineer/i, /dbt/i, /analytic.*engineer/i],
};

function detectRoleType(roleTitle) {
  if (!roleTitle) return null;
  for (const [type, patterns] of Object.entries(ROLE_PATTERNS)) {
    if (patterns.some(p => p.test(roleTitle))) return type;
  }
  return null;
}

function getActiveInterviews(apps) {
  return apps
    .filter(a => a.status === "Interview" || (a.interviewStage && a.interviewStage !== "" && !["Rejected", "Withdrawn", "Ghosted"].includes(a.status)))
    .map(a => ({
      ...a,
      detectedRole: detectRoleType(a.role),
    }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({ title, subtitle, actions = null, children, style = {} }) {
  return (
    <section style={{ background: "#fff", borderRadius: 16, padding: "18px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1.5px solid #E5E7EB", ...style }}>
      {(title || subtitle || actions) && (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            {title && <h3 style={{ margin: 0, color: "#1F4E79", fontSize: 15, fontFamily: "Georgia,serif" }}>{title}</h3>}
            {subtitle && <p style={{ margin: title ? "4px 0 0" : 0, color: "#6B7280", fontSize: 12, lineHeight: 1.5 }}>{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

function ImportanceBadge({ level }) {
  const config = {
    high: { label: "HIGH PRIORITY", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
    medium: { label: "MEDIUM", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
    low: { label: "GOOD TO KNOW", color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB" },
  };
  const c = config[level] || config.medium;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
  );
}

function TopicCard({ topic, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1.5px solid #E5E7EB", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "12px 16px", background: open ? "#F8FAFC" : "#fff",
          border: "none", cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{topic.name}</span>
          <ImportanceBadge level={topic.importance} />
        </div>
        <span style={{ fontSize: 16, color: "#9CA3AF", transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", background: "#FAFBFC" }}>
          {topic.tips && (
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 14px", marginBottom: 14, marginTop: 4 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#1E40AF", lineHeight: 1.6, fontWeight: 600 }}>💡 {topic.tips}</p>
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Key Concepts</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {topic.concepts.map(c => (
                <span key={c} style={{ display: "inline-block", padding: "5px 10px", borderRadius: 8, background: "#F1F5F9", border: "1px solid #E2E8F0", fontSize: 12, color: "#334155", fontWeight: 600 }}>{c}</span>
              ))}
            </div>
          </div>
          {topic.exampleQuestions && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Example Interview Questions</div>
              {topic.exampleQuestions.map((q, i) => (
                <div key={i} style={{ padding: "8px 12px", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, marginBottom: 6, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                  <span style={{ color: "#9CA3AF", fontWeight: 700, marginRight: 6 }}>Q{i + 1}.</span> {q}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TailoredAnswerCard({ item, index }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1.5px solid #E5E7EB", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "14px 16px", background: open ? "#F8FAFC" : "#fff",
          border: "none", cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1 }}>
          <span style={{ color: "#9CA3AF", fontWeight: 800, fontSize: 13 }}>Q{index + 1}.</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{item.question}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {item.tags.map(tag => (
            <span key={tag} style={{ display: "inline-block", padding: "2px 8px", borderRadius: 8, fontSize: 9, fontWeight: 700, color: "#6B7280", background: "#F3F4F6", border: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{tag}</span>
          ))}
          <span style={{ fontSize: 16, color: "#9CA3AF", transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", marginLeft: 4 }}>▼</span>
        </div>
      </button>
      {open && (
        <div style={{ padding: "4px 16px 16px", background: "#FAFBFC" }}>
          <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "14px 16px", lineHeight: 1.8, fontSize: 13, color: "#374151" }}>
            {item.answer}
          </div>
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 11, color: "#92400E", fontWeight: 600 }}>💡 Key points to hit: mention specific project names, tech choices, and quantifiable outcomes. Adapt the ending to the company you're interviewing at.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectArsenalCard({ project }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1.5px solid #E5E7EB", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "14px 18px", background: open ? "#F8FAFC" : "#fff", border: "none",
          cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>{project.emoji}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>{project.name}</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{project.category}</div>
          </div>
        </div>
        <span style={{ fontSize: 16, color: "#9CA3AF", transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: "4px 18px 18px" }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#374151", lineHeight: 1.7 }}>{project.summary}</p>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Tech Stack</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {project.stack.map(tech => (
                <span key={tech} style={{ display: "inline-block", padding: "4px 10px", borderRadius: 8, background: "#F1F5F9", border: "1px solid #E2E8F0", fontSize: 12, color: "#334155", fontWeight: 600 }}>{tech}</span>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Interview Talking Points</div>
            {project.interviewUse.map((point, i) => (
              <div key={i} style={{ padding: "8px 12px", background: i % 2 === 0 ? "#EFF6FF" : "#fff", border: "1px solid #BFDBFE", borderRadius: 8, marginBottom: 6, fontSize: 13, color: "#1E3A5F", lineHeight: 1.5 }}>
                <span style={{ color: "#3B82F6", fontWeight: 800, marginRight: 6 }}>•</span> {point}
              </div>
            ))}
          </div>

          <a href={project.github} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "#F6F8FA", border: "1.5px solid #D1D5DB", color: "#24292E", fontWeight: 700, fontSize: 12, textDecoration: "none" }}>
            View on GitHub ↗
          </a>
        </div>
      )}
    </div>
  );
}

function StageCard({ stage, company, role }) {
  const [open, setOpen] = useState(true);
  const config = STAGE_GUIDANCE[stage];
  if (!config) return null;
  return (
    <div style={{ border: `2px solid ${config.color}22`, borderRadius: 14, marginBottom: 12, overflow: "hidden", background: "#fff" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "14px 18px", background: `${config.color}08`, border: "none",
          cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18 }}>{config.emoji}</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>{config.label}</span>
            <span style={{ fontSize: 12, color: config.color, fontWeight: 700, background: `${config.color}15`, padding: "2px 10px", borderRadius: 10 }}>{config.focus}</span>
          </div>
          {company && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6B7280" }}>Preparing for <strong>{company}</strong>{role ? ` — ${role}` : ""}</p>}
        </div>
        <span style={{ fontSize: 16, color: "#9CA3AF", transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: "4px 18px 16px" }}>
          {config.tips.map((tip, i) => (
            <div key={i} style={{ padding: "10px 14px", background: i % 2 === 0 ? "#F8FAFC" : "#fff", borderRadius: 10, marginTop: 8, fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
              <span style={{ color: config.color, fontWeight: 800, marginRight: 6 }}>{i + 1}.</span> {tip}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main InterviewPrep component
// ---------------------------------------------------------------------------

export default function InterviewPrep({ apps = [] }) {
  const [activeSection, setActiveSection] = useState("dynamic");
  const [selectedGuide, setSelectedGuide] = useState(null);
  const [roleFilter, setRoleFilter] = useState("all");

  const activeInterviews = useMemo(() => getActiveInterviews(apps), [apps]);
  const detectedRoles = useMemo(() => {
    const roles = new Set();
    activeInterviews.forEach(a => { if (a.detectedRole) roles.add(a.detectedRole); });
    return [...roles];
  }, [activeInterviews]);

  const filteredGuides = roleFilter === "all"
    ? STUDY_GUIDE
    : STUDY_GUIDE.filter(g => g.roles.includes(roleFilter));

  const sections = [
    { id: "dynamic", label: "Your Interviews", emoji: "🎯" },
    { id: "profile", label: "Your Profile", emoji: "👤" },
    { id: "answers", label: "Tailored Answers", emoji: "💬" },
    { id: "arsenal", label: "Project Arsenal", emoji: "🚀" },
    { id: "guide", label: "Study Guide", emoji: "📖" },
    { id: "quick-ref", label: "Quick Reference", emoji: "⚡" },
  ];

  return (
    <>
      {/* Section Navigation */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              padding: "10px 18px", borderRadius: 12, border: `2px solid ${activeSection === s.id ? "#1F4E79" : "#E5E7EB"}`,
              background: activeSection === s.id ? "#1F4E79" : "#fff", color: activeSection === s.id ? "#fff" : "#374151",
              cursor: "pointer", fontWeight: 700, fontSize: 13,
            }}
          >
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      {/* Dynamic Section — Pipeline-connected */}
      {activeSection === "dynamic" && (
        <>
          {activeInterviews.length > 0 ? (
            <>
              <SectionCard
                title="Active Interview Prep"
                subtitle={`${activeInterviews.length} application${activeInterviews.length !== 1 ? "s" : ""} with interview activity detected in your pipeline.`}
                style={{ marginBottom: 16, background: "linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%)" }}
              >
                <p style={{ margin: 0, color: "#475569", fontSize: 13, lineHeight: 1.7 }}>
                  Below are personalised prep cards based on your current interviews. Each card is tailored to the role type and interview stage detected from your applications.
                </p>
              </SectionCard>

              {activeInterviews.map(app => {
                const roleConfig = app.detectedRole ? ROLE_TYPES[app.detectedRole] : null;
                const relevantGuides = app.detectedRole
                  ? STUDY_GUIDE.filter(g => g.roles.includes(app.detectedRole))
                  : STUDY_GUIDE.filter(g => g.roles.length === 4 || g.roles.includes("DE")); // default to universal + DE

                return (
                  <div key={app.id} style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontFamily: "Georgia,serif", color: "#1F4E79", fontSize: 17 }}>{app.company}</h3>
                      <span style={{ fontSize: 13, color: "#6B7280" }}>{app.role}</span>
                      {roleConfig && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, color: roleConfig.color, background: roleConfig.bg, border: `1px solid ${roleConfig.border}` }}>
                          {roleConfig.emoji} {roleConfig.label}
                        </span>
                      )}
                      {!roleConfig && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, color: "#6B7280", background: "#F3F4F6", border: "1px solid #E5E7EB" }}>
                          General Prep
                        </span>
                      )}
                    </div>

                    {/* Stage-specific guidance */}
                    {app.interviewStage && STAGE_GUIDANCE[app.interviewStage] && (
                      <StageCard stage={app.interviewStage} company={app.company} role={app.role} />
                    )}

                    {/* Role-relevant study topics */}
                    <SectionCard
                      title="Recommended Topics"
                      subtitle={`Focus areas for ${roleConfig ? roleConfig.label : "this role"} interviews.`}
                    >
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {relevantGuides.map(g => (
                          <button
                            key={g.id}
                            onClick={() => { setActiveSection("guide"); setSelectedGuide(g.id); setRoleFilter("all"); }}
                            style={{
                              padding: "10px 14px", borderRadius: 12, border: `1.5px solid ${g.color}33`,
                              background: `${g.color}08`, cursor: "pointer", textAlign: "left", flex: "1 1 140px", minWidth: 140,
                            }}
                          >
                            <div style={{ fontSize: 16, marginBottom: 4 }}>{g.emoji}</div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{g.title}</div>
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{g.topics.length} topics</div>
                          </button>
                        ))}
                      </div>
                    </SectionCard>
                  </div>
                );
              })}
            </>
          ) : (
            <SectionCard
              title="No Active Interviews Detected"
              subtitle="When applications in your pipeline reach the interview stage, personalised prep cards will appear here automatically."
              style={{ background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)" }}
            >
              <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                <div style={{ background: "#F8FAFC", borderRadius: 12, padding: "12px 14px", color: "#475569", fontSize: 13, lineHeight: 1.7 }}>
                  In the meantime, use the <strong>Study Guide</strong> tab to browse all topics and build your knowledge base ahead of time.
                </div>
                <div style={{ background: "#F8FAFC", borderRadius: 12, padding: "12px 14px", color: "#475569", fontSize: 13, lineHeight: 1.7 }}>
                  The <strong>Quick Reference</strong> tab has cheat sheets for the most commonly tested patterns across all three role types.
                </div>
                <button
                  onClick={() => setActiveSection("guide")}
                  style={{ padding: "12px 18px", borderRadius: 12, border: "2px solid #BFDBFE", background: "#EFF6FF", color: "#1F4E79", cursor: "pointer", fontWeight: 700, fontSize: 13, marginTop: 4 }}
                >
                  Browse Study Guide
                </button>
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* Profile Section — Elevator pitch & skills overview */}
      {activeSection === "profile" && (
        <>
          <SectionCard
            title="Your Elevator Pitch"
            subtitle="Memorise this 30-second introduction. Adapt the ending for each role."
            style={{ marginBottom: 16, background: "linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%)" }}
          >
            <div style={{ background: "#F0F7FF", border: "1.5px solid #BFDBFE", borderRadius: 12, padding: "16px 18px", lineHeight: 1.8, fontSize: 14, color: "#1E3A5F" }}>
              <p style={{ margin: 0, fontStyle: "italic" }}>"{MY_PROFILE.elevatorPitch}"</p>
            </div>
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#92400E", fontWeight: 600 }}>💡 Tip: Replace the last sentence with something specific to the company you're interviewing at. E.g., "I'm particularly excited about [Company]'s approach to [X] because..."</p>
            </div>
          </SectionCard>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 16 }}>
            <SectionCard title="📋 Key Facts to Remember" style={{ background: "linear-gradient(135deg, #fff 0%, #ecfdf5 100%)" }}>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { label: "Degree", value: MY_PROFILE.education },
                  { label: "Location", value: MY_PROFILE.location },
                  { label: "Focus", value: "Data pipelines, analytics engineering, CDC streaming, ML" },
                  { label: "Domains", value: "Finance, Sports, Transport, Environment" },
                  { label: "Projects", value: `${MY_PROJECTS.length} portfolio projects spanning DE, AE, and ML` },
                  { label: "Writing", value: "2 published articles on building lakehouses and community tech" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#6B7280", minWidth: 80, textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</span>
                    <span style={{ fontSize: 13, color: "#111827", fontWeight: 600 }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="🛠️ Technical Stack" style={{ background: "linear-gradient(135deg, #fff 0%, #f5f3ff 100%)" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {MY_PROFILE.coreSkills.map(skill => (
                  <span key={skill} style={{ display: "inline-block", padding: "6px 12px", borderRadius: 8, background: "#EDE9FE", border: "1px solid #DDD6FE", fontSize: 12, color: "#5B21B6", fontWeight: 700 }}>{skill}</span>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#F8FAFC", borderRadius: 10 }}>
                <p style={{ margin: 0, fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>
                  <strong>When asked "What's your tech stack?":</strong> Lead with Python and SQL, then mention dbt and Airflow for the transformation/orchestration layer, then databases (PostgreSQL, BigQuery, ClickHouse, DuckDB), then streaming (Kafka/Redpanda, Debezium). Mention Docker and GitHub Actions for DevOps.
                </p>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="💼 Work Experience" subtitle="Reference these achievements with specific numbers in your answers." style={{ marginBottom: 16 }}>
            {MY_PROFILE.workExperience.map((job, i) => (
              <div key={i} style={{ background: i === 0 ? "#EFF6FF" : "#F8FAFC", border: `1.5px solid ${i === 0 ? "#BFDBFE" : "#E5E7EB"}`, borderRadius: 12, padding: "16px 18px", marginBottom: i < MY_PROFILE.workExperience.length - 1 ? 12 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>{job.role}</div>
                    <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{job.company} · {job.location}</div>
                  </div>
                  <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, whiteSpace: "nowrap" }}>{job.period}</span>
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  {job.highlights.map((h, j) => (
                    <div key={j} style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, paddingLeft: 14, position: "relative" }}>
                      <span style={{ position: "absolute", left: 0, color: "#3B82F6", fontWeight: 800 }}>•</span> {h}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#92400E", fontWeight: 600 }}>💡 Key numbers to remember: 87% freshness improvement, 95% SLA compliance, 12 mentees, 30% defect reduction, 67% faster turnaround, 25+ dashboard users, 8% logistics cost reduction, 12% delivery improvement.</p>
            </div>
          </SectionCard>

          <SectionCard title="🔗 Quick Links" subtitle="Have these ready to share during or after interviews.">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { label: "GitHub", url: MY_PROFILE.links.github, color: "#24292E", bg: "#F6F8FA" },
                { label: "Portfolio", url: MY_PROFILE.links.portfolio, color: "#1F4E79", bg: "#EFF6FF" },
                { label: "LinkedIn", url: MY_PROFILE.links.linkedin, color: "#0A66C2", bg: "#EFF6FF" },
              ].map(link => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, background: link.bg, color: link.color, fontWeight: 700, fontSize: 13, textDecoration: "none", border: `1.5px solid ${link.color}22` }}>
                  {link.label} ↗
                </a>
              ))}
            </div>
          </SectionCard>
        </>
      )}

      {/* Tailored Answers Section — Pre-written answers using your projects */}
      {activeSection === "answers" && (
        <>
          <SectionCard
            title="Tailored Interview Answers"
            subtitle="Pre-written answers referencing your actual projects and experience. Memorise the structure, then adapt naturally."
            style={{ marginBottom: 16, background: "linear-gradient(135deg, #ffffff 0%, #fdf2f8 100%)" }}
          >
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#991B1B", fontWeight: 600 }}>🎯 These answers use the STAR method and reference your real projects. Don't memorise word-for-word — internalise the key points and project references, then deliver naturally.</p>
            </div>
          </SectionCard>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontFamily: "Georgia,serif", color: "#1F4E79", fontSize: 16, marginBottom: 12 }}>🤝 Behavioral & General Questions</h3>
            {TAILORED_ANSWERS.behavioral.map((item, i) => (
              <TailoredAnswerCard key={i} item={item} index={i} />
            ))}
          </div>

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontFamily: "Georgia,serif", color: "#1F4E79", fontSize: 16, marginBottom: 12 }}>🔧 Technical Questions</h3>
            {TAILORED_ANSWERS.technical.map((item, i) => (
              <TailoredAnswerCard key={i} item={item} index={i} />
            ))}
          </div>
        </>
      )}

      {/* Project Arsenal — Quick reference cards for all projects */}
      {activeSection === "arsenal" && (
        <>
          <SectionCard
            title="Your Project Arsenal"
            subtitle={`${MY_PROJECTS.length} projects you can reference in interviews. Each card has key talking points.`}
            style={{ marginBottom: 16, background: "linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)" }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
              When an interviewer asks a technical question, reference a specific project. Concrete examples beat abstract knowledge every time. Use the "Interview Talking Points" on each card to structure your answer.
            </p>
          </SectionCard>

          <div style={{ display: "grid", gap: 14 }}>
            {MY_PROJECTS.map(project => (
              <ProjectArsenalCard key={project.id} project={project} />
            ))}
          </div>
        </>
      )}

      {/* Study Guide Section — Full manual browse */}
      {activeSection === "guide" && (
        <>
          <SectionCard
            title="Interview Study Guide"
            subtitle="Comprehensive preparation material for Data Engineering, Data Analysis, and Analytics Engineering roles."
            style={{ marginBottom: 16 }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { setRoleFilter("all"); setSelectedGuide(null); }} style={{ padding: "7px 14px", borderRadius: 10, border: `2px solid ${roleFilter === "all" ? "#1F4E79" : "#E5E7EB"}`, background: roleFilter === "all" ? "#1F4E79" : "#fff", color: roleFilter === "all" ? "#fff" : "#374151", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                All Topics
              </button>
              {Object.entries(ROLE_TYPES).map(([key, config]) => (
                <button key={key} onClick={() => { setRoleFilter(key); setSelectedGuide(null); }} style={{ padding: "7px 14px", borderRadius: 10, border: `2px solid ${roleFilter === key ? config.color : "#E5E7EB"}`, background: roleFilter === key ? config.color : "#fff", color: roleFilter === key ? "#fff" : "#374151", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                  {config.emoji} {config.label}
                </button>
              ))}
            </div>
            {detectedRoles.length > 0 && (
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6B7280" }}>
                💡 Detected roles from your pipeline: {detectedRoles.map(r => ROLE_TYPES[r].label).join(", ")}
              </p>
            )}
          </SectionCard>

          {filteredGuides.map(guide => (
            <div key={guide.id} style={{ marginBottom: 20 }}>
              <button
                onClick={() => setSelectedGuide(selectedGuide === guide.id ? null : guide.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 18px", borderRadius: selectedGuide === guide.id ? "14px 14px 0 0" : 14,
                  border: `2px solid ${guide.color}33`, background: `${guide.color}06`,
                  cursor: "pointer", marginBottom: selectedGuide === guide.id ? 0 : 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{guide.emoji}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>{guide.title}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{guide.description}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600 }}>{guide.topics.length} topics</span>
                  <span style={{ fontSize: 16, color: "#9CA3AF", transform: selectedGuide === guide.id ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
                </div>
              </button>
              {selectedGuide === guide.id && (
                <div style={{ border: `2px solid ${guide.color}33`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: "14px 14px", background: "#fff" }}>
                  {guide.topics.map(topic => (
                    <TopicCard key={topic.name} topic={topic} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Quick Reference Section */}
      {activeSection === "quick-ref" && (
        <>
          <SectionCard title="Quick Reference Cards" subtitle="Cheat sheets for the most commonly tested patterns." style={{ marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
              Rapid-fire reminders for concepts that come up in almost every data interview. Use these for last-minute review.
            </p>
          </SectionCard>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 16 }}>
            <SectionCard title="🗄️ SQL Patterns to Know Cold" style={{ background: "linear-gradient(135deg, #fff 0%, #eff6ff 100%)" }}>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { pattern: "ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)", use: "Deduplicate / pick one row per group" },
                  { pattern: "LAG(col) OVER (ORDER BY date)", use: "Compare to previous row (e.g., day-over-day)" },
                  { pattern: "SUM(col) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING)", use: "Running total / cumulative sum" },
                  { pattern: "WITH cte AS (SELECT ... ) SELECT * FROM cte", use: "Break complex queries into readable steps" },
                  { pattern: "LEFT JOIN b ON a.id = b.id WHERE b.id IS NULL", use: "Anti-join — find rows with no match" },
                  { pattern: "CASE WHEN ... THEN ... ELSE ... END", use: "Conditional logic inside SELECT/WHERE" },
                  { pattern: "COALESCE(col, fallback_value)", use: "Handle NULLs with a default" },
                  { pattern: "DATE_TRUNC('month', date_col)", use: "Aggregate by time period" },
                ].map((item, i) => (
                  <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px" }}>
                    <code style={{ fontSize: 11, color: "#1E40AF", fontWeight: 700, display: "block", marginBottom: 4, wordBreak: "break-all" }}>{item.pattern}</code>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>{item.use}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="🐍 Python Patterns to Know Cold" style={{ background: "linear-gradient(135deg, #fff 0%, #ecfdf5 100%)" }}>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { pattern: "df.groupby('col').agg({'val': ['mean', 'sum']})", use: "Multi-aggregation in one pass" },
                  { pattern: "df.merge(other, on='key', how='left', indicator=True)", use: "Join with match diagnostics" },
                  { pattern: "df['col'].fillna(method='ffill')", use: "Forward-fill missing values" },
                  { pattern: "df.pivot_table(values='v', index='i', columns='c')", use: "Reshape long to wide" },
                  { pattern: "from collections import Counter; Counter(items)", use: "Fast frequency counts" },
                  { pattern: "sorted(data, key=lambda x: x['date'])", use: "Custom sort by any field" },
                  { pattern: "{k: v for k, v in d.items() if v > threshold}", use: "Dictionary comprehension with filter" },
                  { pattern: "df.pipe(clean).pipe(transform).pipe(validate)", use: "Readable method chains" },
                ].map((item, i) => (
                  <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px" }}>
                    <code style={{ fontSize: 11, color: "#065F46", fontWeight: 700, display: "block", marginBottom: 4, wordBreak: "break-all" }}>{item.pattern}</code>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>{item.use}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 16 }}>
            <SectionCard title="🏗️ System Design Checklist" style={{ background: "linear-gradient(135deg, #fff 0%, #fffbeb 100%)" }}>
              <div style={{ display: "grid", gap: 6 }}>
                {[
                  { step: "1. Clarify requirements", detail: "What data, what volume, what SLA, who consumes it?" },
                  { step: "2. Identify data sources", detail: "APIs, databases, event streams, file drops?" },
                  { step: "3. Choose batch vs streaming", detail: "Is real-time needed, or is daily/hourly enough?" },
                  { step: "4. Design ingestion layer", detail: "How does data enter the system? Pull vs push?" },
                  { step: "5. Design transformation", detail: "Where does cleaning/enrichment happen? Raw -> staged -> mart." },
                  { step: "6. Choose storage", detail: "Warehouse, lake, or lakehouse? Partitioning strategy?" },
                  { step: "7. Plan for failure", detail: "Idempotency, retries, dead letter queues, alerting." },
                  { step: "8. Address data quality", detail: "Tests, monitoring, contracts, freshness checks." },
                ].map((item, i) => (
                  <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#92400E" }}>{item.step}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="🤝 Behavioral Interview Playbook" style={{ background: "linear-gradient(135deg, #fff 0%, #fdf2f8 100%)" }}>
              <div style={{ display: "grid", gap: 6 }}>
                {[
                  { tip: "STAR structure every answer", detail: "Situation (2 sentences) → Task → Action (bulk of answer) → Result (quantified)." },
                  { tip: "Prepare 5-6 versatile stories", detail: "Conflict, failure, leadership, technical challenge, ambiguity, tight deadline." },
                  { tip: "Quantify results", detail: "'Reduced pipeline runtime by 40%' beats 'made it faster'." },
                  { tip: "Use 'I' not 'we'", detail: "Interviewers want YOUR contribution. Credit the team, but be specific about your role." },
                  { tip: "Show growth", detail: "Pick stories where you learned something. 'Here's what I'd do differently' shows self-awareness." },
                  { tip: "Ask good questions back", detail: "Team culture, biggest data challenges, how success is measured, what the onboarding looks like." },
                  { tip: "Handle 'I don't know'", detail: "Say 'I haven't worked with X directly, but here's how I'd approach learning it' — shows adaptability." },
                  { tip: "Close strong", detail: "End with genuine enthusiasm. 'I'm excited about this because...' leaves a lasting impression." },
                ].map((item, i) => (
                  <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#BE185D" }}>{item.tip}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="⚡ Last-Minute Reminders" subtitle="Read this 30 minutes before any interview.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {[
                { emoji: "🔇", text: "Silence your phone, close Slack/email, test your mic and camera." },
                { emoji: "📝", text: "Have a notepad ready. Write down the interviewer's name." },
                { emoji: "💧", text: "Water within reach. It buys you thinking time." },
                { emoji: "🧠", text: "Think out loud. Silence makes interviewers nervous." },
                { emoji: "⏸️", text: "It's OK to pause and say 'Let me think about that for a moment'." },
                { emoji: "🤔", text: "Clarify before solving. 'Can I confirm my understanding?' is always welcome." },
                { emoji: "🏁", text: "Summarise your answer at the end. 'So in summary, I would...' lands well." },
                { emoji: "😊", text: "Be human. A little warmth and humour goes a long way." },
              ].map((item, i) => (
                <div key={i} style={{ background: "#F8FAFC", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{item.emoji}</span>
                  <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </>
  );
}
