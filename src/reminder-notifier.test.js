import test from "node:test";
import assert from "node:assert/strict";
import { checkAndNotify } from "./reminder-notifier.js";

test("sends a granted browser notification and returns the dedupe key", () => {
  const notifications = [];
  class NotificationFake {
    static permission = "granted";
    constructor(title, options) {
      notifications.push({ title, options });
    }
  }

  const result = checkAndNotify({
    config: {
      enabled: true,
      leadMinutes: 20,
      activeStart: "07:00",
      activeEnd: "22:00",
      lastNotificationKey: ""
    },
    insight: { firstRainAt: "2026-07-16T10:55:00+08:00" },
    location: { id: "101020100", name: "上海" },
    weatherText: "中雨",
    now: new Date("2026-07-16T10:40:00+08:00"),
    NotificationImpl: NotificationFake
  });

  assert.equal(result.sent, true);
  assert.equal(result.notificationKey, "101020100:2026-07-16T10:55:00+08:00");
  assert.equal(notifications.length, 1);
});

test("falls back to an in-page alert when notifications are unavailable", () => {
  const result = checkAndNotify({
    config: {
      enabled: true,
      leadMinutes: 20,
      activeStart: "07:00",
      activeEnd: "22:00",
      lastNotificationKey: ""
    },
    insight: { firstRainAt: "2026-07-16T10:55:00+08:00" },
    location: { id: "101020100", name: "上海" },
    weatherText: "中雨",
    now: new Date("2026-07-16T10:40:00+08:00"),
    NotificationImpl: null
  });

  assert.equal(result.sent, false);
  assert.equal(result.inPage, true);
  assert.match(result.message, /15 分钟后/);
});
