import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAnalyticsStore } from "./analytics-store.js";

test("aggregates page views and deduplicates anonymous daily visitors", async (t) => {
  const filePath = await temporaryFile(t);
  const store = createAnalyticsStore({
    filePath,
    hashSecret: "test-secret",
    now: () => Date.parse("2026-07-16T12:00:00+08:00")
  });

  await store.record({ type: "page_view", visitorId: "install-a", at: "2026-07-16T10:00:00+08:00" });
  await store.record({ type: "page_view", visitorId: "install-a", at: "2026-07-16T11:00:00+08:00" });
  await store.record({ type: "page_view", visitorId: "install-b", at: "2026-07-16T11:30:00+08:00" });

  const overview = await store.overview(7);
  assert.equal(overview.totals.pageViews, 3);
  assert.equal(overview.totals.activeVisitors, 2);
  assert.equal(overview.days[0].activeVisitors, 2);
  assert.equal("visitorHashes" in overview.days[0], false);
  await store.close();
});

test("aggregates scene, reminder, city-selection, and error events", async (t) => {
  const store = createAnalyticsStore({
    filePath: await temporaryFile(t),
    hashSecret: "test-secret",
    now: () => Date.parse("2026-07-16T12:00:00+08:00")
  });

  await store.record({ type: "city_selected", visitorId: "a" });
  await store.record({ type: "scene_changed", visitorId: "a", properties: { mode: "outdoor" } });
  await store.record({ type: "reminder_enabled", visitorId: "a" });
  await store.record({ type: "notification_sent", visitorId: "a" });
  await store.record({ type: "client_error", visitorId: "a", properties: { category: "weather_details" } });

  const totals = (await store.overview(7)).totals;
  assert.equal(totals.citySelections, 1);
  assert.equal(totals.scenes.outdoor, 1);
  assert.equal(totals.reminders.enabled, 1);
  assert.equal(totals.reminders.sent, 1);
  assert.equal(totals.errors.weather_details, 1);
  await store.close();
});

test("keeps only the latest 30 natural days", async (t) => {
  const store = createAnalyticsStore({
    filePath: await temporaryFile(t),
    hashSecret: "test-secret",
    now: () => Date.parse("2026-07-31T12:00:00+08:00")
  });

  await store.record({ type: "page_view", visitorId: "old", at: "2026-06-30T10:00:00+08:00" });
  await store.record({ type: "page_view", visitorId: "new", at: "2026-07-31T10:00:00+08:00" });
  await store.close();

  const disk = JSON.parse(await fs.readFile(store.filePath, "utf8"));
  assert.equal(disk.days["2026-06-30"], undefined);
  assert.equal(disk.days["2026-07-31"].pageViews, 1);
});

test("recovers from corrupt storage without blocking metrics", async (t) => {
  const filePath = await temporaryFile(t);
  await fs.writeFile(filePath, "not-json");
  const store = createAnalyticsStore({
    filePath,
    hashSecret: "test-secret",
    now: () => Date.parse("2026-07-16T12:00:00+08:00")
  });

  await store.record({ type: "page_view", visitorId: "a" });
  assert.equal((await store.overview(7)).totals.pageViews, 1);
  assert.equal(store.health().recoveredFromCorruption, true);
  await store.close();
});

test("degrades to memory when persistence is unavailable", async () => {
  const fsImpl = {
    readFile: async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); },
    mkdir: async () => {},
    writeFile: async () => { throw Object.assign(new Error("readonly"), { code: "EACCES" }); },
    rename: async () => {},
    rm: async () => {}
  };
  const store = createAnalyticsStore({
    filePath: "/readonly/analytics.json",
    hashSecret: "test-secret",
    fsImpl,
    now: () => Date.parse("2026-07-16T12:00:00+08:00")
  });

  await store.record({ type: "page_view", visitorId: "a" });
  assert.equal((await store.overview(7)).totals.pageViews, 1);
  assert.equal(store.health().persistence, "memory-only");
  await store.close();
});

async function temporaryFile(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "weather-analytics-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return path.join(directory, "analytics.json");
}
