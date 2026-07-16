import test from "node:test";
import assert from "node:assert/strict";
import { evaluateReminder } from "./reminder-engine.js";

const base = {
  config: {
    enabled: true,
    leadMinutes: 20,
    activeStart: "07:00",
    activeEnd: "22:00",
    lastNotificationKey: ""
  },
  firstRainAt: "2026-07-16T10:55:00+08:00",
  now: new Date("2026-07-16T10:40:00+08:00"),
  location: { id: "101020100", name: "上海" },
  weatherText: "中雨"
};

test("notifies when rain enters the configured lead window", () => {
  const result = evaluateReminder(base);

  assert.equal(result.shouldNotify, true);
  assert.equal(result.notificationKey, "101020100:2026-07-16T10:55:00+08:00");
  assert.match(result.title, /上海.*15 分钟后/);
  assert.match(result.body, /中雨|带伞/);
});

test("does not notify outside the lead window or active hours", () => {
  assert.equal(evaluateReminder({ ...base, now: new Date("2026-07-16T10:20:00+08:00") }).reason, "outside-lead-window");
  assert.equal(evaluateReminder({
    ...base,
    now: new Date("2026-07-16T06:50:00+08:00"),
    firstRainAt: "2026-07-16T07:05:00+08:00"
  }).reason, "outside-active-hours");
});

test("deduplicates the same rain event", () => {
  const key = "101020100:2026-07-16T10:55:00+08:00";
  const result = evaluateReminder({ ...base, config: { ...base.config, lastNotificationKey: key } });

  assert.equal(result.shouldNotify, false);
  assert.equal(result.reason, "already-notified");
});

test("supports active windows that cross midnight", () => {
  const result = evaluateReminder({
    ...base,
    config: { ...base.config, activeStart: "22:00", activeEnd: "06:00" },
    now: new Date("2026-07-16T23:50:00+08:00"),
    firstRainAt: "2026-07-17T00:05:00+08:00"
  });

  assert.equal(result.shouldNotify, true);
});

test("returns explicit reasons for disabled or incomplete settings", () => {
  assert.equal(evaluateReminder({ ...base, config: { ...base.config, enabled: false } }).reason, "disabled");
  assert.equal(evaluateReminder({ ...base, firstRainAt: null }).reason, "no-rain");
  assert.equal(evaluateReminder({ ...base, location: null }).reason, "missing-location");
});
