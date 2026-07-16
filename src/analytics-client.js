const ID_KEY = "weather-pro:analytics-id";
const SIMPLE_EVENTS = new Set([
  "page_view",
  "city_selected",
  "reminder_enabled",
  "reminder_disabled",
  "notification_sent"
]);
const MODES = new Set(["commute", "outdoor", "family"]);
const ERROR_CATEGORIES = new Set(["weather_core", "weather_details", "notification", "location", "unknown"]);

export function createAnalyticsClient({
  storage = globalThis.localStorage,
  navigatorImpl = globalThis.navigator,
  fetchImpl = globalThis.fetch,
  randomUUID = () => globalThis.crypto.randomUUID(),
  enabled = true
} = {}) {
  function visitorId() {
    const existing = storage?.getItem(ID_KEY);
    if (existing) return existing;
    const created = randomUUID();
    storage?.setItem(ID_KEY, created);
    return created;
  }

  async function track(type, properties = {}) {
    if (!enabled) return false;
    const safeProperties = normalizeProperties(type, properties);
    if (safeProperties === null) return false;
    const body = JSON.stringify({ type, visitorId: visitorId(), properties: safeProperties });

    if (typeof navigatorImpl?.sendBeacon === "function") {
      return navigatorImpl.sendBeacon(
        "/api/analytics/events",
        new Blob([body], { type: "application/json" })
      );
    }

    try {
      await fetchImpl("/api/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true
      });
      return true;
    } catch {
      return false;
    }
  }

  return { track };
}

function normalizeProperties(type, properties) {
  if (SIMPLE_EVENTS.has(type)) return {};
  if (type === "scene_changed" && MODES.has(properties?.mode)) return { mode: properties.mode };
  if (type === "client_error" && ERROR_CATEGORIES.has(properties?.category)) {
    return { category: properties.category };
  }
  return null;
}
