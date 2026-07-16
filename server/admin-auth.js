import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const COOKIE_NAME = "weather_admin";

export function createAdminAuth({
  password,
  now = Date.now,
  randomBytes = crypto.randomBytes,
  idleMs = 30 * 60 * 1000,
  maxFailures = 5,
  blockMs = 15 * 60 * 1000
} = {}) {
  const enabled = Boolean(password);
  const sessions = new Map();
  const failures = new Map();
  const salt = "weather-pro-admin-v1";
  const expectedPromise = enabled ? derive(password, salt) : null;

  async function login(candidate, clientKey = "global") {
    if (!enabled) return { status: 404 };
    const current = now();
    const failure = failures.get(clientKey);
    if (failure?.blockedUntil > current) return { status: 429 };

    const expected = await expectedPromise;
    const actual = await derive(String(candidate || ""), salt);
    if (!crypto.timingSafeEqual(expected, actual)) {
      const count = (failure?.count || 0) + 1;
      const blocked = count >= maxFailures;
      failures.set(clientKey, {
        count,
        blockedUntil: blocked ? current + blockMs : 0
      });
      return { status: blocked ? 429 : 401 };
    }

    failures.delete(clientKey);
    const sessionId = randomBytes(32).toString("hex");
    sessions.set(sessionId, { lastSeenAt: current });
    return { status: 200, sessionId };
  }

  function verify(sessionId) {
    if (!enabled || !sessionId) return false;
    const session = sessions.get(sessionId);
    if (!session) return false;
    const current = now();
    if (current - session.lastSeenAt > idleMs) {
      sessions.delete(sessionId);
      return false;
    }
    session.lastSeenAt = current;
    return true;
  }

  function logout(sessionId) {
    if (sessionId) sessions.delete(sessionId);
  }

  return { enabled, login, verify, logout };
}

export function serializeSessionCookie(value, { secure = false, maxAge = 30 * 60 } = {}) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionCookie(header = "") {
  for (const item of String(header).split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("=") || "");
  }
  return "";
}

async function derive(value, salt) {
  return scrypt(value, salt, 32);
}
