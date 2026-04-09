import secureSeed from "./secureSeed.json";

export const AUTH_USERNAME = "aosman1017";
export const AUTH_SESSION_KEY = "adil-job-tracker-session";
export const AUTH_SESSION_DATA_KEY = "adil-job-tracker-session-data";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveKey(username, password) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${username}:${password}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: decodeBase64(secureSeed.salt),
      iterations: secureSeed.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["decrypt"],
  );
}

export async function unlockSeed(username, password) {
  if (typeof crypto?.subtle === "undefined") {
    throw new Error("This browser does not support Web Crypto.");
  }

  const normalizedUsername = username.trim();
  if (normalizedUsername !== AUTH_USERNAME) {
    throw new Error("Incorrect username or password.");
  }

  const key = await deriveKey(normalizedUsername, password);
  const payload = decodeBase64(secureSeed.ciphertext);
  const tagLength = 16;
  const encrypted = payload.slice(0, payload.length - tagLength);
  const tag = payload.slice(payload.length - tagLength);
  const combined = new Uint8Array(encrypted.length + tag.length);
  combined.set(encrypted);
  combined.set(tag, encrypted.length);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decodeBase64(secureSeed.iv),
    },
    key,
    combined,
  );

  return JSON.parse(decoder.decode(decrypted));
}

export function getSecureSeedCount() {
  return secureSeed.seedCount ?? 0;
}

export function readSessionApps() {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_DATA_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}
