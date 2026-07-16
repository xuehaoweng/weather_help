import test from "node:test";
import assert from "node:assert/strict";
import {
  createAdminAuth,
  readSessionCookie,
  serializeSessionCookie
} from "./admin-auth.js";

test("is disabled when no administrator password is configured", async () => {
  const auth = createAdminAuth({ password: "" });
  assert.equal(auth.enabled, false);
  assert.equal((await auth.login("anything")).status, 404);
  assert.equal(auth.verify("session"), false);
});

test("creates and verifies a short-lived session for the correct username and password", async () => {
  let current = 1_000;
  const auth = createAdminAuth({
    username: "admin",
    password: "correct horse",
    now: () => current,
    randomBytes: () => Buffer.from("session-id")
  });

  assert.equal((await auth.login({ username: "other", password: "correct horse" }, "127.0.0.1")).status, 401);
  assert.equal((await auth.login({ username: "admin", password: "wrong" }, "127.0.0.1")).status, 401);
  const login = await auth.login({ username: "admin", password: "correct horse" }, "127.0.0.1");
  assert.equal(login.status, 200);
  assert.equal(auth.verify(login.sessionId), true);

  current += 29 * 60 * 1000;
  assert.equal(auth.verify(login.sessionId), true);
  current += 31 * 60 * 1000;
  assert.equal(auth.verify(login.sessionId), false);
});

test("rate limits repeated login failures", async () => {
  const auth = createAdminAuth({
    password: "secret",
    maxFailures: 3,
    now: () => 1_000
  });

  assert.equal((await auth.login({ username: "admin", password: "bad" }, "client-a")).status, 401);
  assert.equal((await auth.login({ username: "admin", password: "bad" }, "client-a")).status, 401);
  assert.equal((await auth.login({ username: "admin", password: "bad" }, "client-a")).status, 429);
  assert.equal((await auth.login({ username: "admin", password: "secret" }, "client-a")).status, 429);
});

test("logout invalidates the session", async () => {
  const auth = createAdminAuth({ password: "secret" });
  const login = await auth.login({ username: "admin", password: "secret" });
  assert.equal(auth.verify(login.sessionId), true);
  auth.logout(login.sessionId);
  assert.equal(auth.verify(login.sessionId), false);
});

test("serializes strict HttpOnly cookies and reads them safely", () => {
  const development = serializeSessionCookie("abc", { secure: false });
  assert.match(development, /weather_admin=abc/);
  assert.match(development, /HttpOnly/);
  assert.match(development, /SameSite=Strict/);
  assert.doesNotMatch(development, /Secure/);

  const production = serializeSessionCookie("abc", { secure: true });
  assert.match(production, /Secure/);
  assert.equal(readSessionCookie("other=x; weather_admin=abc; theme=dark"), "abc");
  assert.equal(readSessionCookie(""), "");
});
