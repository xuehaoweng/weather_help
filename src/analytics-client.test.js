import test from "node:test";
import assert from "node:assert/strict";
import { createAnalyticsClient } from "./analytics-client.js";

test("creates a stable anonymous visitor and sends allowlisted events", async () => {
  const storage = memoryStorage();
  const calls = [];
  const client = createAnalyticsClient({
    storage,
    randomUUID: () => "install-a",
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return { ok: true };
    },
    navigatorImpl: {}
  });

  assert.equal(await client.track("page_view"), true);
  assert.equal(await client.track("scene_changed", { mode: "outdoor" }), true);
  assert.equal(calls[0].visitorId, "install-a");
  assert.equal(calls[1].visitorId, "install-a");
  assert.equal(storage.getItem("weather-pro:analytics-id"), "install-a");
});

test("filters unknown events and privacy-sensitive properties", async () => {
  const calls = [];
  const client = createAnalyticsClient({
    storage: memoryStorage(),
    randomUUID: () => "install-a",
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return { ok: true };
    },
    navigatorImpl: {}
  });

  assert.equal(await client.track("unknown"), false);
  assert.equal(await client.track("city_selected", { city: "上海" }), true);
  assert.deepEqual(calls[0].properties, {});
  assert.equal(await client.track("scene_changed", { mode: "secret" }), false);
  assert.equal(calls.length, 1);
});

test("uses sendBeacon when available", async () => {
  const beacons = [];
  const client = createAnalyticsClient({
    storage: memoryStorage(),
    randomUUID: () => "install-a",
    navigatorImpl: {
      sendBeacon: (url, body) => {
        beacons.push({ url, body });
        return true;
      }
    }
  });

  assert.equal(await client.track("reminder_enabled"), true);
  assert.equal(beacons[0].url, "/api/analytics/events");
  assert.equal(JSON.parse(await beacons[0].body.text()).type, "reminder_enabled");
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}
