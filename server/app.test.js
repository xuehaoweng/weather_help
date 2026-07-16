import test from "node:test";
import assert from "node:assert/strict";
import { createWeatherHandlers } from "./app.js";
import { createWeatherService } from "./weather-service.js";

test("weather handlers expose core, details, full, and validation contracts", async () => {
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true,
    apiHost: "mock.test"
  });

  const core = await handlers.weather({ location: "101020100", lon: "121.47", lat: "31.23" });
  assert.equal(core.status, 200);
  assert.ok(core.body.now);
  assert.equal(core.body.minutely, undefined);

  const details = await handlers.details({ location: "101020100", lon: "121.47", lat: "31.23" });
  assert.equal(details.status, 200);
  assert.ok(details.body.minutely);
  assert.equal(details.body.now, undefined);

  const full = await handlers.weather({ full: "true", location: "101020100", lon: "121.47", lat: "31.23" });
  assert.equal(full.status, 200);
  assert.ok(full.body.now);
  assert.ok(full.body.minutely);

  const invalid = await handlers.weather({ location: "x", lon: "999", lat: "31" });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "INVALID_LOCATION");
});

test("health and mock location search remain available", async () => {
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true,
    apiHost: "mock.test"
  });

  assert.equal(handlers.health().body.mode, "mock");
  const locations = await handlers.locations({ q: "上海" });
  assert.equal(locations.status, 200);
  assert.equal(locations.body.locations[0].name, "上海");
  assert.equal((await handlers.locations({ q: "" })).status, 400);
});

test("mock location search resolves the nearest city from coordinates", async () => {
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true,
    apiHost: "mock.test"
  });

  const nearest = await handlers.locations({ q: "121.47,31.23" });
  assert.equal(nearest.status, 200);
  assert.equal(nearest.body.locations[0].name, "上海");

  const invalid = await handlers.locations({ q: "999,31" });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "INVALID_LOCATION");
});

test("real location search forwards coordinate strings to QWeather lookup", async () => {
  const calls = [];
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: false,
    apiHost: "api.test",
    lookupLocations: async (keyword, query) => {
      calls.push({ keyword, query });
      return { location: [{ id: "101020100", name: "上海" }] };
    }
  });

  const result = await handlers.locations({ q: "121.47,31.23" });
  assert.equal(result.status, 200);
  assert.equal(result.body.locations[0].name, "上海");
  assert.equal(calls[0].keyword, "121.47,31.23");
});

test("analytics handler accepts only privacy-safe event shapes", async () => {
  const events = [];
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true,
    analyticsEnabled: true,
    analyticsStore: {
      record: async (event) => events.push(event)
    }
  });

  assert.equal((await handlers.analytics({ type: "page_view", visitorId: "install-a" })).status, 202);
  assert.equal((await handlers.analytics({
    type: "scene_changed",
    visitorId: "install-a",
    properties: { mode: "outdoor" }
  })).status, 202);
  assert.equal((await handlers.analytics({ type: "unknown", visitorId: "install-a" })).status, 400);
  assert.equal((await handlers.analytics({
    type: "scene_changed",
    visitorId: "install-a",
    properties: { mode: "secret" }
  })).status, 400);
  assert.equal((await handlers.analytics({
    type: "city_selected",
    visitorId: "install-a",
    properties: { city: "上海" }
  })).status, 400);
  assert.deepEqual(events.map((event) => event.type), ["page_view", "scene_changed"]);
});

test("disabled analytics acknowledges events without storing them", async () => {
  let calls = 0;
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true,
    analyticsEnabled: false,
    analyticsStore: { record: async () => { calls += 1; } }
  });

  assert.equal((await handlers.analytics({ type: "page_view", visitorId: "a" })).status, 204);
  assert.equal(calls, 0);
});

test("admin handlers protect overview and health data", async () => {
  const sessions = new Set(["valid-session"]);
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true,
    health: { analyticsEnabled: true },
    analyticsStore: {
      overview: async (range) => ({ range, totals: { pageViews: 3 }, days: [] }),
      health: () => ({ persistence: "disk" })
    },
    adminAuth: {
      enabled: true,
      login: async (password) => password === "secret"
        ? { status: 200, sessionId: "valid-session" }
        : { status: 401 },
      verify: (sessionId) => sessions.has(sessionId),
      logout: (sessionId) => sessions.delete(sessionId)
    },
    startedAt: "2026-07-16T00:00:00.000Z"
  });

  assert.equal((await handlers.adminOverview({ range: "7" }, "")).status, 401);
  const overview = await handlers.adminOverview({ range: "30" }, "valid-session");
  assert.equal(overview.status, 200);
  assert.equal(overview.body.range, 30);
  assert.equal(overview.body.totals.pageViews, 3);

  const health = await handlers.adminHealth("valid-session");
  assert.equal(health.status, 200);
  assert.equal(health.body.analytics.persistence, "disk");
  assert.equal(health.body.startedAt, "2026-07-16T00:00:00.000Z");

  assert.equal((await handlers.adminLogout("valid-session")).status, 204);
  assert.equal((await handlers.adminOverview({}, "valid-session")).status, 401);
});

test("admin overview stays available when anonymous analytics is disabled", async () => {
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true,
    adminAuth: {
      enabled: true,
      verify: () => true,
      logout: () => {},
      login: async () => ({ status: 200, sessionId: "session" })
    }
  });

  const overview = await handlers.adminOverview({ range: "7" }, "session");
  assert.equal(overview.status, 200);
  assert.equal(overview.body.totals.pageViews, 0);
  assert.deepEqual(overview.body.days, []);
});

test("admin session check returns a non-error authentication state", async () => {
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true,
    adminAuth: {
      enabled: true,
      verify: (sessionId) => sessionId === "valid",
      logout: () => {},
      login: async () => ({ status: 200, sessionId: "valid" })
    }
  });

  assert.deepEqual(await handlers.adminSession(""), {
    status: 200,
    body: { enabled: true, authenticated: false }
  });
  assert.deepEqual(await handlers.adminSession("valid"), {
    status: 200,
    body: { enabled: true, authenticated: true }
  });

  const disabled = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true
  });
  assert.deepEqual(await disabled.adminSession(""), {
    status: 200,
    body: { enabled: false, authenticated: false }
  });
});
