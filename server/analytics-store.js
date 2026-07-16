import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SCHEMA_VERSION = 1;

export function createAnalyticsStore({
  filePath = path.resolve(".cache/analytics.json"),
  hashSecret,
  now = Date.now,
  fsImpl = fs,
  retentionDays = 30
} = {}) {
  let data = { version: SCHEMA_VERSION, days: {} };
  let writePromise = Promise.resolve();
  let persistenceDisabled = false;
  let recoveredFromCorruption = false;
  const ready = restore();

  async function record(event = {}) {
    await ready;
    const at = validDate(event.at) || new Date(now());
    const day = dayKey(at);
    const bucket = data.days[day] || createDay();
    data.days[day] = bucket;
    increment(bucket, event);
    if (event.visitorId && hashSecret) {
      const hash = visitorHash(hashSecret, day, event.visitorId);
      if (!bucket.visitorHashes.includes(hash)) bucket.visitorHashes.push(hash);
    }
    prune(dayKey(new Date(now())));
    await schedulePersist();
  }

  async function overview(range = 7) {
    await ready;
    const days = Object.entries(data.days)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-normalizeRange(range))
      .map(([date, bucket]) => publicDay(date, bucket));
    return {
      range: normalizeRange(range),
      days,
      totals: days.reduce(addDay, createPublicDay("total"))
    };
  }

  function health() {
    return {
      persistence: persistenceDisabled ? "memory-only" : "disk",
      recoveredFromCorruption,
      retainedDays: Object.keys(data.days).length
    };
  }

  async function close() {
    await ready;
    await writePromise;
  }

  async function restore() {
    try {
      const parsed = JSON.parse(await fsImpl.readFile(filePath, "utf8"));
      if (parsed?.version === SCHEMA_VERSION && parsed.days && typeof parsed.days === "object") {
        data = {
          version: SCHEMA_VERSION,
          days: Object.fromEntries(
            Object.entries(parsed.days)
              .filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day))
              .map(([day, bucket]) => [day, normalizeDay(bucket)])
          )
        };
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        recoveredFromCorruption = true;
        await isolateCorruptFile().catch(() => {});
      }
    }
  }

  function schedulePersist() {
    if (persistenceDisabled) return Promise.resolve();
    writePromise = writePromise
      .then(() => persist())
      .catch(() => {
        persistenceDisabled = true;
      });
    return writePromise;
  }

  async function persist() {
    const directory = path.dirname(filePath);
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fsImpl.mkdir(directory, { recursive: true });
    try {
      await fsImpl.writeFile(temporary, JSON.stringify(data), "utf8");
      await fsImpl.rename(temporary, filePath);
    } finally {
      await fsImpl.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async function isolateCorruptFile() {
    const target = `${filePath}.corrupt-${Date.now()}`;
    await fsImpl.rename(filePath, target);
  }

  function prune(currentDay) {
    const cutoff = new Date(`${currentDay}T00:00:00+08:00`);
    cutoff.setUTCDate(cutoff.getUTCDate() - (retentionDays - 1));
    const cutoffKey = dayKey(cutoff);
    for (const day of Object.keys(data.days)) {
      if (day < cutoffKey) delete data.days[day];
    }
  }

  return { filePath, record, overview, health, close };
}

function increment(bucket, event) {
  switch (event.type) {
    case "page_view":
      bucket.pageViews += 1;
      break;
    case "city_selected":
      bucket.citySelections += 1;
      break;
    case "scene_changed": {
      const mode = event.properties?.mode;
      if (mode in bucket.scenes) bucket.scenes[mode] += 1;
      break;
    }
    case "reminder_enabled":
      bucket.reminders.enabled += 1;
      break;
    case "reminder_disabled":
      bucket.reminders.disabled += 1;
      break;
    case "notification_sent":
      bucket.reminders.sent += 1;
      break;
    case "client_error": {
      const category = String(event.properties?.category || "unknown");
      bucket.errors[category] = (bucket.errors[category] || 0) + 1;
      break;
    }
    default:
      break;
  }
}

function createDay() {
  return {
    pageViews: 0,
    visitorHashes: [],
    citySelections: 0,
    scenes: { commute: 0, outdoor: 0, family: 0 },
    reminders: { enabled: 0, disabled: 0, sent: 0 },
    errors: {}
  };
}

function normalizeDay(value = {}) {
  const empty = createDay();
  return {
    pageViews: finiteCount(value.pageViews),
    visitorHashes: Array.isArray(value.visitorHashes) ? [...new Set(value.visitorHashes.filter((item) => typeof item === "string"))] : [],
    citySelections: finiteCount(value.citySelections),
    scenes: {
      commute: finiteCount(value.scenes?.commute),
      outdoor: finiteCount(value.scenes?.outdoor),
      family: finiteCount(value.scenes?.family)
    },
    reminders: {
      enabled: finiteCount(value.reminders?.enabled),
      disabled: finiteCount(value.reminders?.disabled),
      sent: finiteCount(value.reminders?.sent)
    },
    errors: Object.fromEntries(
      Object.entries(value.errors || {})
        .filter(([key]) => typeof key === "string")
        .map(([key, count]) => [key, finiteCount(count)])
    )
  };
}

function publicDay(date, bucket) {
  return {
    date,
    pageViews: bucket.pageViews,
    activeVisitors: bucket.visitorHashes.length,
    citySelections: bucket.citySelections,
    scenes: { ...bucket.scenes },
    reminders: { ...bucket.reminders },
    errors: { ...bucket.errors }
  };
}

function createPublicDay(date) {
  return {
    date,
    pageViews: 0,
    activeVisitors: 0,
    citySelections: 0,
    scenes: { commute: 0, outdoor: 0, family: 0 },
    reminders: { enabled: 0, disabled: 0, sent: 0 },
    errors: {}
  };
}

function addDay(total, day) {
  total.pageViews += day.pageViews;
  total.activeVisitors += day.activeVisitors;
  total.citySelections += day.citySelections;
  for (const mode of Object.keys(total.scenes)) total.scenes[mode] += day.scenes[mode];
  for (const key of Object.keys(total.reminders)) total.reminders[key] += day.reminders[key];
  for (const [key, count] of Object.entries(day.errors)) total.errors[key] = (total.errors[key] || 0) + count;
  return total;
}

function visitorHash(secret, day, visitorId) {
  return crypto.createHmac("sha256", secret).update(`${day}:${visitorId}`).digest("hex");
}

function dayKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai"
  }).formatToParts(date);
  const read = (type) => parts.find((item) => item.type === type)?.value;
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function finiteCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function normalizeRange(value) {
  return Number(value) === 30 ? 30 : 7;
}
