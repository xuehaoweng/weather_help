const STORAGE_KEY = "weather-pro:reminder";
const ALLOWED_LEAD_MINUTES = new Set([10, 20, 30]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_REMINDER = Object.freeze({
  version: 1,
  enabled: false,
  location: null,
  leadMinutes: 20,
  activeStart: "07:00",
  activeEnd: "22:00",
  lastNotificationKey: ""
});

export function loadReminder(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY));
    if (parsed?.version !== 1) return cloneDefault();
    return normalizeReminder(parsed);
  } catch {
    return cloneDefault();
  }
}

export function saveReminder(storage = globalThis.localStorage, value = {}) {
  const normalized = normalizeReminder({ ...value, version: 1 });
  storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function normalizeReminder(value) {
  return {
    version: 1,
    enabled: value.enabled === true,
    location: normalizeLocation(value.location),
    leadMinutes: ALLOWED_LEAD_MINUTES.has(Number(value.leadMinutes)) ? Number(value.leadMinutes) : 20,
    activeStart: TIME_PATTERN.test(String(value.activeStart || "")) ? value.activeStart : "07:00",
    activeEnd: TIME_PATTERN.test(String(value.activeEnd || "")) ? value.activeEnd : "22:00",
    lastNotificationKey: typeof value.lastNotificationKey === "string" ? value.lastNotificationKey : ""
  };
}

function normalizeLocation(location) {
  if (!location || !String(location.id || "").trim() || !String(location.name || "").trim()) return null;
  return {
    id: String(location.id),
    name: String(location.name),
    lon: String(location.lon || ""),
    lat: String(location.lat || "")
  };
}

function cloneDefault() {
  return { ...DEFAULT_REMINDER };
}
