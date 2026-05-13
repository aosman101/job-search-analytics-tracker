import { Suspense, lazy, useState } from "react";
import {
  AUTH_SESSION_KEY,
  readUnlockedSession,
  unlockSeed,
} from "./auth";
import changelog from "./data/changelog.json";

const CHANGELOG_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatChangelogDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return CHANGELOG_DATE_FORMATTER.format(parsed);
}

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
          <p className="eyebrow">Private Dashboard</p>
          <h1 className="login-title">Job Search Command Centre</h1>
          <p className="login-copy">
            A private local-first workspace for tracking applications, follow-ups,
            interview stages, outcomes, and preparation material in one place.
          </p>

          <div className="info-grid">
            <article className="info-card">
              <span className="info-label">Storage Model</span>
              <strong>Browser-first with exportable backups</strong>
            </article>
            <article className="info-card">
              <span className="info-label">Workflow</span>
              <strong>Pipeline, follow-ups, prep, and analytics</strong>
            </article>
            <article className="info-card">
              <span className="info-label">Access</span>
              <strong>Username and password unlock required</strong>
            </article>
          </div>

          <div className="metric-strip" aria-label="Tracker capabilities">
            <div>
              <strong>Lifecycle Metrics</strong>
              <span>Response, interview, offer, rejection timing</span>
            </div>
            <div>
              <strong>Pipeline Risk</strong>
              <span>Due follow-ups and ghost-risk detection</span>
            </div>
            <div>
              <strong>Interview Practice</strong>
              <span>Role-specific Q&amp;A and study guides</span>
            </div>
          </div>

          <div className="preview-section">
            <p className="preview-heading">A peek inside</p>
            <ul className="preview-list">
              <li>
                <span className="preview-dot" aria-hidden="true" />
                <div>
                  <strong>Application operating view</strong>
                  <span>Every role has a clear status, follow-up date, notes, contacts, and lifecycle history.</span>
                </div>
              </li>
              <li>
                <span className="preview-dot" aria-hidden="true" />
                <div>
                  <strong>Interview readiness</strong>
                  <span>Prep material connects to active interviews so study time follows the live pipeline.</span>
                </div>
              </li>
              <li>
                <span className="preview-dot" aria-hidden="true" />
                <div>
                  <strong>Resilient storage</strong>
                  <span>IndexedDB primary storage, local backup, import/export, and corrupt-data recovery.</span>
                </div>
              </li>
              <li>
                <span className="preview-dot" aria-hidden="true" />
                <div>
                  <strong>Static private utility</strong>
                  <span>No server database. The unlock gate decrypts starter data and protects casual access.</span>
                </div>
              </li>
            </ul>
          </div>

          {changelog.length > 0 && (
            <div className="changelog-section" aria-label="Recent updates">
              <p className="preview-heading">What&apos;s new</p>
              <ol className="changelog-list">
                {changelog.slice(0, 3).map((entry) => (
                  <li key={`${entry.date}-${entry.title}`} className="changelog-item">
                    <time className="changelog-date" dateTime={entry.date}>
                      {formatChangelogDate(entry.date)}
                    </time>
                    <strong className="changelog-title">{entry.title}</strong>
                    <span className="changelog-note">{entry.note}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <form className="login-card" onSubmit={handleLogin}>
          <p className="card-kicker">Secure Access</p>
          <h2 className="auth-heading">Unlock your tracker</h2>
          <p className="auth-intro">
            Enter your credentials to decrypt the starter dataset and open the local dashboard.
          </p>
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
            This is a static personal app. The login protects encrypted seed data
            client-side; ongoing tracker data remains in your browser storage.
          </p>
        </form>
      </section>
    </main>
  );
}
