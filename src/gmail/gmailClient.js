/**
 * Browser-only Gmail access via Google Identity Services.
 *
 * The site is static (GitHub Pages), so there is no server to hold a refresh
 * token. GIS hands the page a short-lived (~1h) access token scoped to
 * read-only mail; it is kept in sessionStorage only, never persisted, and
 * requests go straight from the browser to Google — nothing passes through
 * any other server.
 */

const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SETTINGS_KEY = "adil-job-tracker-gmail";
const TOKEN_KEY = "adil-job-tracker-gmail-token";

// Broad on purpose: the classifier does the precise filtering. This only has
// to keep newsletters and job alerts out of the fetch budget.
const SEARCH_QUERY = [
  "(",
  'subject:(application OR applying OR applied OR candidacy OR interview OR "your application" OR "thank you for your interest")',
  'OR "thank you for applying" OR "thanks for applying" OR "received your application"',
  'OR "your application was sent" OR "regret to inform" OR "unfortunately"',
  ")",
  "-from:jobalerts-noreply@linkedin.com -from:jobs-listings@linkedin.com -from:alert@indeed.com",
  "-category:promotions -category:social",
].join(" ");

const MAX_MESSAGES = 250;

export function readGmailSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(GMAIL_SETTINGS_KEY) || "{}");
    return {
      clientId: stored.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
      connected: Boolean(stored.connected),
      email: stored.email || "",
      lastSyncAt: stored.lastSyncAt || null,
      autoSync: stored.autoSync !== false,
      bridgeUrl: stored.bridgeUrl || "",
      bridgeKey: stored.bridgeKey || "",
      processedIds: Array.isArray(stored.processedIds) ? stored.processedIds : [],
      log: Array.isArray(stored.log) ? stored.log : [],
    };
  } catch (_) {
    return { clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || "", connected: false, email: "", lastSyncAt: null, autoSync: true, bridgeUrl: "", bridgeKey: "", processedIds: [], log: [] };
  }
}

export function writeGmailSettings(settings) {
  try {
    // Cap the processed-id list so storage cannot grow without bound; the
    // sync window means ids older than this are never fetched again anyway.
    const trimmed = { ...settings, processedIds: settings.processedIds.slice(-3000), log: settings.log.slice(0, 50) };
    localStorage.setItem(GMAIL_SETTINGS_KEY, JSON.stringify(trimmed));
  } catch (_) {
    // Best-effort: worst case the next sync re-reads a few emails and dedupes them.
  }
}

let gisPromise = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gisPromise = null;
        reject(new Error("Could not load Google sign-in. Check your connection or ad blocker."));
      };
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}

export function readCachedToken() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
    // Treat tokens as expired a minute early so a sync never starts on one
    // that dies halfway through.
    if (cached?.accessToken && cached.expiresAt - 60_000 > Date.now()) return cached.accessToken;
  } catch (_) {}
  return null;
}

export function clearCachedToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
}

/**
 * Ask Google for an access token. Must run from a user gesture the first
 * time (it opens a popup); with `silent` it only succeeds if Google can grant
 * without showing UI.
 */
export async function requestAccessToken(clientId, { silent = false, hint = "" } = {}) {
  if (!clientId) throw new Error("Add your Google OAuth client ID first.");
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      prompt: silent ? "none" : "",
      hint,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        const expiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: response.access_token, expiresAt })); } catch (_) {}
        resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(error?.message || error?.type || "Google sign-in was cancelled.")),
    });
    client.requestAccessToken();
  });
}

export function revokeAccess() {
  const token = readCachedToken();
  clearCachedToken();
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
}

async function gmailFetch(token, path) {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    clearCachedToken();
    const error = new Error("Gmail session expired. Reconnect to sync.");
    error.code = "auth";
    throw error;
  }
  if (!response.ok) throw new Error(`Gmail request failed (${response.status}).`);
  return response.json();
}

export async function fetchProfileEmail(token) {
  const profile = await gmailFetch(token, "/profile");
  return profile.emailAddress || "";
}

function decodeBase64Url(data) {
  try {
    const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (_) {
    return "";
  }
}

function htmlToText(html) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
}

function extractBody(payload) {
  let plain = "";
  let html = "";
  const walk = (part) => {
    if (!part) return;
    if (part.mimeType === "text/plain" && part.body?.data && !plain) plain = decodeBase64Url(part.body.data);
    else if (part.mimeType === "text/html" && part.body?.data && !html) html = decodeBase64Url(part.body.data);
    (part.parts || []).forEach(walk);
  };
  walk(payload);
  return plain || htmlToText(html);
}

function header(payload, name) {
  return payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function localDateFromMs(ms) {
  const date = new Date(Number(ms));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Fetch candidate job emails received since `sinceMs`, skipping ids already
 * processed. Returns plain objects ready for classifyEmail.
 */
export async function fetchJobEmails(token, { sinceMs, skipIds = new Set(), onProgress } = {}) {
  const after = Math.floor(sinceMs / 1000);
  const q = encodeURIComponent(`${SEARCH_QUERY} after:${after}`);
  const ids = [];
  let pageToken = "";
  do {
    const page = await gmailFetch(token, `/messages?q=${q}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`);
    (page.messages || []).forEach((message) => { if (!skipIds.has(message.id)) ids.push(message.id); });
    pageToken = page.nextPageToken || "";
  } while (pageToken && ids.length < MAX_MESSAGES);

  const selected = ids.slice(0, MAX_MESSAGES);
  const emails = [];
  // Small fixed concurrency keeps well inside Gmail's per-user rate limit.
  for (let i = 0; i < selected.length; i += 8) {
    const batch = await Promise.all(selected.slice(i, i + 8).map((id) => gmailFetch(token, `/messages/${id}?format=full`)));
    batch.forEach((message) => {
      emails.push({
        id: message.id,
        subject: header(message.payload, "Subject"),
        from: header(message.payload, "From"),
        date: localDateFromMs(message.internalDate),
        snippet: message.snippet || "",
        body: extractBody(message.payload),
      });
    });
    onProgress?.(Math.min(i + 8, selected.length), selected.length);
  }
  return emails;
}

// ---------------------------------------------------------------------------
// Apps Script bridge — always-on alternative to the browser token flow
// ---------------------------------------------------------------------------

export function generateBridgeKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isBridgeUrl(value) {
  return /^https:\/\/script\.google(usercontent)?\.com\/macros\/s\/[\w-]+\/exec$/.test((value || "").trim());
}

/**
 * Fetch job emails through the user's own Apps Script deployment. A plain
 * GET with no custom headers, so it needs no CORS preflight; Apps Script
 * answers via a redirect that allows any origin.
 */
export async function fetchViaBridge(url, key, { sinceMs, skipIds = new Set() } = {}) {
  let response;
  try {
    response = await fetch(`${url.trim()}?key=${encodeURIComponent(key)}&since=${Math.floor(sinceMs)}`);
  } catch (_) {
    throw new Error("Could not reach your Apps Script. Check the deployment URL and that access is set to \"Anyone\".");
  }
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch (_) {
    throw new Error("Apps Script didn't return data. Redeploy it as a Web app with access set to \"Anyone\".");
  }
  if (!payload.ok) {
    throw new Error(payload.error === "unauthorized"
      ? "Apps Script rejected the key. Copy the script again from this dialog and redeploy it."
      : payload.error || "Apps Script sync failed.");
  }
  return {
    account: payload.account || "",
    emails: (payload.emails || []).filter((email) => !skipIds.has(email.id)),
  };
}
