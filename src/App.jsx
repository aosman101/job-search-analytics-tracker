import { Suspense, lazy, useState } from "react";
import {
  AUTH_SESSION_KEY,
  readUnlockedSession,
  unlockSeed,
} from "./auth";

const JobTracker = lazy(() => import("./JobTracker"));

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [apps, setApps] = useState([]);
  const [authenticated, setAuthenticated] = useState(readUnlockedSession);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const payload = await unlockSeed(username, password);
      const nextApps = Array.isArray(payload?.apps) ? payload.apps : [];

      sessionStorage.setItem(AUTH_SESSION_KEY, "unlocked");
      setApps(nextApps);
      setAuthenticated(true);
      setPassword("");
    } catch (_) {
      setError("Incorrect username or password.");
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    setApps([]);
    setAuthenticated(false);
    setPassword("");
    setError("");
  }

  if (authenticated) {
    return (
      <Suspense fallback={<main className="login-shell"><div className="login-card"><p className="card-kicker">Loading</p><h1 className="login-title">Preparing your tracker...</h1></div></main>}>
        <JobTracker initialApps={apps} onLogout={handleLogout} />
      </Suspense>
    );
  }

  return (
    <main className="login-shell">
      <section className="login-layout">
        <div className="login-panel">
          <div className="login-status-row">
            <p className="eyebrow">Personal Productivity Tool</p>
            <span className="privacy-pill">Private Data Protected</span>
          </div>
          <h1 className="login-title">Job Search Analytics Tracker</h1>
          <p className="login-copy">
            A local-first React dashboard built to manage a real job search: applications,
            follow-ups, interview stages, outcomes, metrics, and role-specific preparation.
          </p>

          <div className="visitor-brief" aria-label="About this tracker">
            <div>
              <span>What this is</span>
              <strong>A focused operations dashboard for a personal job search workflow.</strong>
            </div>
            <div>
              <span>What stays private</span>
              <strong>Actual application records are protected behind the unlock screen.</strong>
            </div>
          </div>

          <div className="info-grid">
            <article className="info-card">
              <span className="info-label">Stack</span>
              <strong>React, Vite, IndexedDB, local backup</strong>
            </article>
            <article className="info-card">
              <span className="info-label">Workflow Coverage</span>
              <strong>Pipeline, follow-ups, prep, metrics</strong>
            </article>
            <article className="info-card">
              <span className="info-label">Design Goal</span>
              <strong>Practical, private, and exportable</strong>
            </article>
          </div>

          <div className="metric-strip" aria-label="Tracker capabilities">
            <div>
              <span className="metric-value">01</span>
              <strong>Track</strong>
              <span>Applications, contacts, notes, links, and status changes</span>
            </div>
            <div>
              <span className="metric-value">02</span>
              <strong>Prioritise</strong>
              <span>Follow-ups, active interviews, and ghost-risk applications</span>
            </div>
            <div>
              <span className="metric-value">03</span>
              <strong>Prepare</strong>
              <span>Role-specific Q&amp;A, technical drills, and final-round prep</span>
            </div>
          </div>

          <div className="operations-panel" aria-label="Dashboard overview">
            <div className="operations-header">
              <span>Workspace Overview</span>
              <strong>Built for repeat job-search decisions, not one-off notes</strong>
            </div>
            <div className="operations-grid">
              {[
                ["Pipeline", "Live application board with follow-up state and lifecycle timestamps."],
                ["Metrics", "Conversion rates, rejection timing, ghost risk, and search concentration."],
                ["Prep", "Practice bank for recruiter screens, STAR answers, SQL, Python, and system design."],
                ["Backup", "IndexedDB persistence with local fallback and JSON import/export."],
              ].map(([title, text]) => (
                <div className="operation-item" key={title}>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <form className="login-card" onSubmit={handleLogin}>
          <div className="auth-card-header">
            <p className="card-kicker">Owner Access</p>
            <span className="auth-lock" aria-hidden="true">⌁</span>
          </div>
          <h2 className="auth-heading">Unlock your tracker</h2>
          <p className="auth-intro">
            Credentials are required to decrypt the starter dataset and open the private dashboard.
          </p>

          <div className="auth-summary">
            <div>
              <span>Session</span>
              <strong>Private browser session</strong>
            </div>
            <div>
              <span>Data</span>
              <strong>Stored locally after unlock</strong>
            </div>
          </div>

          <label className="field-label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="auth-input"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />

          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="auth-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-button" disabled={busy} type="submit">
            {busy ? "Unlocking..." : "Unlock Tracker"}
          </button>

          <p className="auth-note">
            Visitors can review what the tool does from this page. Private job-search data is only
            available after unlock and remains in browser storage.
          </p>
        </form>
      </section>
    </main>
  );
}
