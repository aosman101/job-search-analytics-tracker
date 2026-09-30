import { useState } from "react";
import { Copy, Mail, RefreshCw } from "lucide-react";
import bridgeSource from "./appsScriptBridge.gs?raw";
import { generateBridgeKey, isBridgeUrl } from "./gmailClient";

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

const METHODS = [
  { id: "bridge", label: "Always-on", helper: "Apps Script · recommended" },
  { id: "oauth", label: "Google sign-in", helper: "Cloud Console · hourly" },
];

/**
 * Connection, sync, and activity view for the Gmail integration. Rendered
 * inside the tracker's Modal so focus handling stays consistent.
 */
export default function GmailPanel({ gmail, onClose, onOpenApp }) {
  const { settings, syncing, progress, error, sync, disconnect, setClientId, setAutoSync, setBridge, bridgeReady } = gmail;
  const configured = bridgeReady || Boolean(settings.clientId);
  const [setupOpen, setSetupOpen] = useState(!configured);
  const [method, setMethod] = useState(bridgeReady || !settings.clientId ? "bridge" : "oauth");
  const [clientDraft, setClientDraft] = useState(settings.clientId);
  const [urlDraft, setUrlDraft] = useState(settings.bridgeUrl);
  // The key is minted once and baked into the script the user copies; it only
  // changes if they explicitly ask, because that means redeploying.
  const [bridgeKey, setBridgeKey] = useState(() => settings.bridgeKey || generateBridgeKey());
  const [copied, setCopied] = useState(false);
  const [lookback, setLookback] = useState(90);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const script = bridgeSource.replace("__TRACKER_KEY__", bridgeKey);

  const connected = settings.connected || bridgeReady;
  const syncLabel = syncing
    ? progress ? `Reading ${progress.done}/${progress.total}…` : "Checking inbox…"
    : connected ? "Sync now" : "Connect Gmail";

  // Persist the key the moment it leaves this dialog, so closing before the
  // URL is pasted can't strand a deployed script with a forgotten key.
  const rememberKey = (key) => setBridge(settings.bridgeUrl, key);

  const copyScript = async () => {
    rememberKey(bridgeKey);
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {
      setCopied(false);
    }
  };

  const saveBridge = () => {
    setBridge(urlDraft, bridgeKey);
    setSetupOpen(false);
    sync({ interactive: true, lookbackDays: lookback });
  };

  return (
    <>
      <div className="modal-header">
        <div className="modal-header__row">
          <h2 className="modal-title">Gmail Sync</h2>
          <span className="gmail-state" data-state={connected ? "on" : "off"}>
            {bridgeReady ? "Always-on" : connected ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="modal-subtitle">
          Reads application confirmations, rejections, and interview invites from your inbox and updates the tracker
          automatically. Read-only, and the emails are only sent to this browser.
        </p>
      </div>

      <div className="modal-body stack">
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

        {setupOpen ? (
          <div className="gmail-setup">
            <div className="gmail-methods" role="radiogroup" aria-label="Connection method">
              {METHODS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={method === item.id}
                  className="gmail-method"
                  onClick={() => setMethod(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.helper}</span>
                </button>
              ))}
            </div>

            {method === "bridge" ? (
              <>
                <p className="muted-note">
                  A small script runs in your own Google account and hands this tracker your job emails. It keeps
                  syncing whenever the tracker is open, and you never have to sign in again.
                </p>
                <ol className="gmail-setup__steps">
                  <li>Open <strong>script.google.com</strong> and click <strong>New project</strong>.</li>
                  <li>Delete the sample code, then paste the script below (it already includes your private key).</li>
                  <li>Click <strong>Deploy → New deployment</strong>, choose type <strong>Web app</strong>, set <em>Execute as: Me</em> and <em>Who has access: Anyone</em>, then click <strong>Deploy</strong> and approve the Gmail permission.</li>
                  <li>Copy the <strong>Web app URL</strong> (ends in <code>/exec</code>) and paste it below.</li>
                </ol>
                <div className="gmail-code">
                  <div className="gmail-code__bar">
                    <span>Code.gs</span>
                    <button type="button" className="soft-button soft-button--icon" onClick={copyScript}>
                      <Copy size={13} aria-hidden="true" />
                      {copied ? "Copied" : "Copy script"}
                    </button>
                  </div>
                  <pre tabIndex={0} aria-label="Apps Script source"><code>{script}</code></pre>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="gmail-bridge-url">Web app URL</label>
                  <input
                    id="gmail-bridge-url"
                    className="field__control"
                    placeholder="https://script.google.com/macros/s/…/exec"
                    value={urlDraft}
                    onChange={(event) => setUrlDraft(event.target.value)}
                  />
                </div>
                <p className="muted-note">
                  Anyone with both the URL and the key can read these job emails, so keep them private. They're
                  stored only in this browser. Use <strong>New key</strong> if you think they've leaked, then
                  redeploy the script.
                </p>
                <div className="gmail-row">
                  <button type="button" className="modal-button modal-button--primary" disabled={!isBridgeUrl(urlDraft) || syncing} onClick={saveBridge}>
                    Save and sync
                  </button>
                  <button type="button" className="modal-button modal-button--neutral" onClick={() => { const key = generateBridgeKey(); setBridgeKey(key); rememberKey(key); }}>
                    New key
                  </button>
                  {configured && (
                    <button type="button" className="modal-button modal-button--neutral" onClick={() => setSetupOpen(false)}>Cancel</button>
                  )}
                </div>
              </>
            ) : (
              <>
                <ol className="gmail-setup__steps">
                  <li>Open <strong>console.cloud.google.com</strong>, create a project, and enable the <strong>Gmail API</strong>.</li>
                  <li>Under <strong>Google Auth Platform → Audience</strong>, keep it in <em>Testing</em> and add your Gmail address as a test user.</li>
                  <li>Under <strong>Clients</strong>, create an OAuth client of type <em>Web application</em>.</li>
                  <li>Add <code>{origin}</code> as an <em>Authorized JavaScript origin</em>.</li>
                  <li>Paste the client ID below. It isn't a secret.</li>
                </ol>
                <p className="muted-note">Google limits browser sign-ins to one hour, so after that you'll need to click Sync now.</p>
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
                    onClick={() => { setClientId(clientDraft); setBridge("", settings.bridgeKey); setSetupOpen(false); }}
                  >
                    Save client ID
                  </button>
                  {configured && (
                    <button type="button" className="modal-button modal-button--neutral" onClick={() => setSetupOpen(false)}>Cancel</button>
                  )}
                </div>
              </>
            )}
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

            <div className="gmail-row">
              <button
                type="button"
                className="modal-button modal-button--primary gmail-sync-button"
                disabled={syncing}
                onClick={() => sync({ interactive: true, lookbackDays: lookback })}
              >
                {connected ? <RefreshCw size={15} aria-hidden="true" className={syncing ? "spin" : ""} /> : <Mail size={15} aria-hidden="true" />}
                {syncLabel}
              </button>
              <label className="gmail-toggle">
                <input type="checkbox" checked={settings.autoSync} onChange={(event) => setAutoSync(event.target.checked)} />
                Auto-sync every 15 min while open
              </label>
            </div>

            <p className="muted-note">
              {bridgeReady
                ? "Always-on: syncs when you open the tracker, every 15 minutes, and whenever you come back to the tab."
                : "Google gives this page a one-hour session. While it lasts, the tracker syncs on its own. After that, click Sync now, and Google won't ask you to approve it again."}
            </p>
          </>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}

        {!setupOpen && (
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
        )}
      </div>

      <div className="modal-actions">
        {!setupOpen && (
          <button type="button" className="modal-button modal-button--neutral" onClick={() => setSetupOpen(true)}>
            Change setup
          </button>
        )}
        {connected && (
          <button type="button" className="modal-button modal-button--danger" onClick={disconnect}>Disconnect</button>
        )}
        <button type="button" className="modal-button modal-button--secondary" onClick={onClose}>Close</button>
      </div>
    </>
  );
}
