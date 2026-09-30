import { useState } from "react";
import { Mail, RefreshCw } from "lucide-react";

function formatWhen(ms) {
  if (!ms) return "Never";
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString();
}

const CHANGE_LABEL = {
  Applied: "Added as applied",
  Rejected: "Marked rejected",
  Interview: "Moved to interview",
};

/**
 * Connection, sync, and activity view for the Gmail integration. Rendered
 * inside the tracker's Modal so focus handling stays consistent.
 */
export default function GmailPanel({ gmail, onClose, onOpenApp }) {
  const { settings, syncing, progress, error, sync, disconnect, setClientId, setAutoSync } = gmail;
  const [clientDraft, setClientDraft] = useState(settings.clientId);
  const [lookback, setLookback] = useState(90);
  const [editingClient, setEditingClient] = useState(!settings.clientId);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const syncLabel = syncing
    ? progress ? `Reading ${progress.done}/${progress.total}…` : "Checking inbox…"
    : settings.connected ? "Sync now" : "Connect Gmail";

  return (
    <>
      <div className="modal-header">
        <div className="modal-header__row">
          <h2 className="modal-title">Gmail Sync</h2>
          <span className="gmail-state" data-state={settings.connected ? "on" : "off"}>
            {settings.connected ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="modal-subtitle">
          Reads application confirmations, rejections, and interview invites from your inbox and updates the tracker
          automatically. Read-only access. Emails never leave your browser.
        </p>
      </div>

      <div className="modal-body stack">
        {editingClient ? (
          <div className="gmail-setup">
            <p className="gmail-setup__title">One-time setup (about 5 minutes)</p>
            <ol className="gmail-setup__steps">
              <li>Open <strong>console.cloud.google.com</strong>, create a project, and enable the <strong>Gmail API</strong>.</li>
              <li>Under <strong>Google Auth Platform → Audience</strong>, keep it in <em>Testing</em> and add your Gmail address as a test user.</li>
              <li>Under <strong>Clients</strong>, create an OAuth client of type <em>Web application</em>.</li>
              <li>Add <code>{origin}</code> as an <em>Authorized JavaScript origin</em>, and <code>https://aosman101.github.io</code> too if you want sync on the live site.</li>
              <li>Paste the client ID below. It is not a secret, so it is safe to store in the browser.</li>
            </ol>
            <div className="field">
              <label className="field__label" htmlFor="gmail-client-id">OAuth client ID</label>
              <input
                id="gmail-client-id"
                className="field__control"
                placeholder="1234567890-abc.apps.googleusercontent.com"
                value={clientDraft}
                onChange={(event) => setClientDraft(event.target.value)}
              />
            </div>
            <div className="gmail-row">
              <button
                type="button"
                className="modal-button modal-button--primary"
                disabled={!/\.apps\.googleusercontent\.com$/.test(clientDraft.trim())}
                onClick={() => { setClientId(clientDraft); setEditingClient(false); }}
              >
                Save client ID
              </button>
              {settings.clientId && (
                <button type="button" className="modal-button modal-button--neutral" onClick={() => { setClientDraft(settings.clientId); setEditingClient(false); }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="kv-grid gmail-summary">
              <div>
                <div className="kv-label">Account</div>
                <div className="kv-value">{settings.email || "—"}</div>
              </div>
              <div>
                <div className="kv-label">Last sync</div>
                <div className="kv-value">{formatWhen(settings.lastSyncAt)}</div>
              </div>
            </div>

            {!settings.lastSyncAt && (
              <div className="field">
                <label className="field__label" htmlFor="gmail-lookback">First sync looks back</label>
                <select id="gmail-lookback" className="field__control" value={lookback} onChange={(event) => setLookback(Number(event.target.value))}>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>6 months</option>
                  <option value={365}>1 year</option>
                </select>
              </div>
            )}

            <div className="gmail-row">
              <button
                type="button"
                className="modal-button modal-button--primary gmail-sync-button"
                disabled={syncing}
                onClick={() => sync({ interactive: true, lookbackDays: lookback })}
              >
                {settings.connected ? <RefreshCw size={15} aria-hidden="true" className={syncing ? "spin" : ""} /> : <Mail size={15} aria-hidden="true" />}
                {syncLabel}
              </button>
              <label className="gmail-toggle">
                <input type="checkbox" checked={settings.autoSync} onChange={(event) => setAutoSync(event.target.checked)} />
                Auto-sync every 15 min while open
              </label>
            </div>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <p className="muted-note">
              Google grants this page a one-hour session. While it lasts, the tracker syncs on its own when you open it
              and every 15 minutes. After that, click <strong>Sync now</strong> to continue; Google won't ask again once
              you've approved it.
            </p>

            <div>
              <div className="kv-label">Recent email updates</div>
              {settings.log.length === 0 ? (
                <p className="muted-note">Nothing yet. Updates from your inbox will be listed here.</p>
              ) : (
                <ul className="gmail-log">
                  {settings.log.slice(0, 8).flatMap((entry) => entry.changes.map((change) => (
                    <li key={`${entry.at}-${change.messageId}`} className="gmail-log__item">
                      <button type="button" className="gmail-log__link" onClick={() => onOpenApp(change.appId)}>
                        <span className="status-badge" data-status={change.status}>{CHANGE_LABEL[change.status] || change.status}</span>
                        <span className="gmail-log__text"><strong>{change.company}</strong>{change.role ? ` · ${change.role}` : ""}</span>
                        <span className="gmail-log__when">{formatWhen(entry.at)}</span>
                      </button>
                    </li>
                  )))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <div className="modal-actions">
        {!editingClient && (
          <button type="button" className="modal-button modal-button--neutral" onClick={() => setEditingClient(true)}>
            Change client ID
          </button>
        )}
        {settings.connected && (
          <button type="button" className="modal-button modal-button--danger" onClick={disconnect}>Disconnect</button>
        )}
        <button type="button" className="modal-button modal-button--secondary" onClick={onClose}>Close</button>
      </div>
    </>
  );
}
