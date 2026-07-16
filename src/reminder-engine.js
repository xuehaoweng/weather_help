export function evaluateReminder({
  config,
  firstRainAt,
  now = new Date(),
  location,
  weatherText = "降雨"
} = {}) {
  if (!config?.enabled) return skipped("disabled");
  if (!location?.id || !location?.name) return skipped("missing-location");
  if (!firstRainAt) return skipped("no-rain");

  const rainAt = new Date(firstRainAt);
  if (Number.isNaN(rainAt.getTime())) return skipped("invalid-rain-time");
  if (!isWithinActiveHours(now, config.activeStart, config.activeEnd)) return skipped("outside-active-hours");

  const minutesUntilRain = Math.ceil((rainAt.getTime() - now.getTime()) / 60_000);
  if (minutesUntilRain <= 0 || minutesUntilRain > Number(config.leadMinutes || 20)) {
    return skipped("outside-lead-window");
  }

  const notificationKey = `${location.id}:${firstRainAt}`;
  if (config.lastNotificationKey === notificationKey) return skipped("already-notified", notificationKey);

  return {
    shouldNotify: true,
    reason: "rain-soon",
    notificationKey,
    title: `${location.name} ${minutesUntilRain} 分钟后可能下雨`,
    body: `${weatherText || "降雨"}，出门请带伞并留意路况。`
  };
}

export function isWithinActiveHours(date, start = "07:00", end = "22:00") {
  const current = minutesOfDay(date);
  const startMinutes = parseTime(start, 7 * 60);
  const endMinutes = parseTime(end, 22 * 60);
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return current >= startMinutes && current < endMinutes;
  return current >= startMinutes || current < endMinutes;
}

function minutesOfDay(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).formatToParts(date);
  const hour = Number(parts.find((item) => item.type === "hour")?.value || 0);
  const minute = Number(parts.find((item) => item.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function parseTime(value, fallback) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return fallback;
  return hour * 60 + minute;
}

function skipped(reason, notificationKey = "") {
  return { shouldNotify: false, reason, notificationKey };
}
