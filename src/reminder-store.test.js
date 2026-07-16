import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REMINDER, loadReminder, saveReminder } from "./reminder-store.js";

test("loads a safe default when no reminder exists", () => {
  assert.deepEqual(loadReminder(memoryStorage()), DEFAULT_REMINDER);
});

test("normalizes and persists a valid versioned reminder", () => {
  const storage = memoryStorage();
  const saved = saveReminder(storage, {
    enabled: true,
    location: { id: "101020100", name: "上海", lon: "121.4737", lat: "31.23037" },
    leadMinutes: 30,
    activeStart: "06:30",
    activeEnd: "23:00",
    lastNotificationKey: "old"
  });

  assert.deepEqual(saved, {
    version: 1,
    enabled: true,
    location: { id: "101020100", name: "上海", lon: "121.4737", lat: "31.23037" },
    leadMinutes: 30,
    activeStart: "06:30",
    activeEnd: "23:00",
    lastNotificationKey: "old"
  });
  assert.deepEqual(loadReminder(storage), saved);
});

test("corrupt or unsupported reminder data falls back to defaults", () => {
  const corrupt = memoryStorage({ "weather-pro:reminder": "not-json" });
  const future = memoryStorage({ "weather-pro:reminder": JSON.stringify({ version: 9, enabled: true }) });

  assert.deepEqual(loadReminder(corrupt), DEFAULT_REMINDER);
  assert.deepEqual(loadReminder(future), DEFAULT_REMINDER);
});

test("invalid reminder fields are constrained to safe values", () => {
  const saved = saveReminder(memoryStorage(), {
    enabled: "yes",
    location: { id: "", name: "" },
    leadMinutes: 999,
    activeStart: "99:00",
    activeEnd: "",
    lastNotificationKey: 123
  });

  assert.equal(saved.enabled, false);
  assert.equal(saved.location, null);
  assert.equal(saved.leadMinutes, 20);
  assert.equal(saved.activeStart, "07:00");
  assert.equal(saved.activeEnd, "22:00");
  assert.equal(saved.lastNotificationKey, "");
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}
