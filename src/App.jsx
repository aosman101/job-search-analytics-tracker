import { Suspense, lazy, useState } from "react";
import {
  AUTH_SESSION_DATA_KEY,
  AUTH_SESSION_KEY,
  AUTH_USERNAME,
  getSecureSeedCount,
  readSessionApps,
  unlockSeed,
} from "./auth";

const sessionApps = readSessionApps();
const JobTracker = lazy(() => import("./JobTracker"));

export default function App() {
  const [username, setUsername] = useState(AUTH_USERNAME);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [apps, setApps] = useState(sessionApps ?? []);
  const [authenticated, setAuthenticated] = useState(Boolean(sessionApps));

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const payload = await unlockSeed(username, password);
      const nextApps = Array.isArray(payload?.apps) ? payload.apps : [];

      sessionStorage.setItem(AUTH_SESSION_KEY, "unlocked");
      sessionStorage.setItem(AUTH_SESSION_DATA_KEY, JSON.stringify(nextApps));

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
    sessionStorage.removeItem(AUTH_SESSION_DATA_KEY);
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
          <h1 className="login-title">Adil&apos;s Job Tracker</h1>
          <p className="login-copy">
            Unlock the dashboard to decrypt the embedded seed data, load your
            tracker, and continue working from browser storage.
          </p>

          <div className="info-grid">
            <article className="info-card">
              <span className="info-label">Seeded Records</span>
              <strong>{getSecureSeedCount()} applications</strong>
            </article>
            <article className="info-card">
              <span className="info-label">Storage Model</span>
              <strong>IndexedDB + local backup</strong>
            </article>
            <article className="info-card">
              <span className="info-label">Hosting Target</span>
              <strong>GitHub Pages ready</strong>
            </article>
          </div>
        </div>

        <form className="login-card" onSubmit={handleLogin}>
          <p className="card-kicker">App Access</p>
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
            This is still a static site. The login gate protects the encrypted
            seed data client-side, but it is not equivalent to server-side auth.
          </p>
        </form>
      </section>
    </main>
  );
}
