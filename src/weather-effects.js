const ICONS = {
  clear: setOf(100, 150),
  cloudy: setOf(101, 102, 103, 151, 152, 153),
  overcast: setOf(104),
  thunder: setOf(302, 303, 304),
  rain: setOf(300, 301, ...range(305, 318), 350, 351, 399),
  snow: setOf(...range(400, 410), 456, 457, 499),
  fog: setOf(500, 501, 509, 510, 514, 515),
  haze: setOf(502, 511, 512, 513),
  dust: setOf(503, 504, 507, 508)
};

const NIGHT_ICONS = setOf(150, 151, 152, 153, 350, 351, 456, 457);
const MIXED_ICONS = setOf(404, 405, 406, 456);
const TEXT_FALLBACK_ICONS = setOf(900, 901, 999);
const CLOUD_KINDS = new Set(["cloudy", "overcast", "rain", "snow", "thunder"]);
const DARK_CLOUD_KINDS = new Set(["overcast", "rain", "snow", "thunder"]);

const WIND_ANGLES = {
  北风: 0,
  东北风: 45,
  东风: 90,
  东南风: 135,
  南风: 180,
  西南风: 225,
  西风: 270,
  西北风: 315
};

const SNOW_MINIMUMS = new Map([
  [400, 0.2], [407, 0.2], [457, 0.2],
  [401, 0.4], [402, 0.65], [403, 0.9],
  [408, 0.3], [409, 0.55], [410, 0.8],
  [404, 0.35], [405, 0.35], [406, 0.35], [456, 0.35], [499, 0.35]
]);

export function particleDuration(base, factor, min, max) {
  return clamp(base * factor, min, max);
}

export function resolveWeatherScene(now, status, { compact = false } = {}) {
  if (status !== "success" || !now) return emptyScene();

  const icon = parseIcon(now.icon);
  const kind = classify(icon, now.text);
  const isNight = icon !== null && NIGHT_ICONS.has(icon);
  const precipitationType = getPrecipitationType(kind, icon, now.text);
  const windSpeed = validNumber(now.windSpeed, 0);
  const windFactor = clamp(windSpeed / 50, 0, 1);
  const windAngle = resolveWindAngle(now.wind360, now.windDir);
  const rawDirectionX = windAngle === null ? 0 : -Math.sin((windAngle * Math.PI) / 180);
  const windDirectionX = Math.abs(rawDirectionX) < 1e-10 ? 0 : rawDirectionX;
  const hasHorizontalWind = windSpeed >= 3 && Math.abs(windDirectionX) >= 0.05;
  const precipFactor = clamp(validNumber(now.precip, 0) / 5, 0, 1);
  const intensity = resolveIntensity(kind, icon, precipFactor);
  const { cloudFactor, cloudLayers } = resolveClouds(kind, icon, now.cloud);
  const cloudDuration = clamp(38 - windFactor * 28, 10, 38);
  const atmosphereDuration = clamp(60 - windFactor * 36, 24, 60);

  const fullRainCount = 24 + Math.round(intensity * 48);
  const rainCount = precipitationType === "rain"
    ? Math.min(compact ? 40 : 72, fullRainCount)
    : precipitationType === "mixed"
      ? Math.min(compact ? 10 : 18, Math.round(fullRainCount * 0.25))
      : 0;
  const rainDuration = clamp(1.15 - intensity * 0.35 - windFactor * 0.25, 0.55, 1.2);
  const rainOffsetX = hasHorizontalWind ? windDirectionX * windFactor * 180 : 0;

  const snowCount = kind === "snow"
    ? Math.min(compact ? 32 : 56, 18 + Math.round(intensity * 38))
    : 0;
  const snowDuration = clamp(5.5 - intensity * 1.4 - windFactor * 1.3, 2.8, 5.5);
  const snowOffsetX = hasHorizontalWind ? windDirectionX * windFactor * 140 : 0;

  const dustCount = kind === "dust" && hasHorizontalWind
    ? Math.min(compact ? 18 : 32, 12 + Math.round(windFactor * 20))
    : 0;
  const dustDuration = clamp(9 - windFactor * 6, 3, 9);
  const dustOffsetX = hasHorizontalWind ? windDirectionX * (160 + windFactor * 240) : 0;

  return {
    kind,
    isNight,
    precipitationType,
    intensity,
    cloudFactor,
    cloudLayers,
    windSpeed,
    windFactor,
    windDirectionX,
    hasHorizontalWind,
    cloudDuration,
    atmosphereDuration,
    rainCount,
    rainDuration,
    rainOffsetX,
    snowCount,
    snowDuration,
    snowOffsetX,
    dustCount,
    dustDuration,
    dustOffsetX
  };
}

function classify(icon, text = "") {
  if (icon !== null && !TEXT_FALLBACK_ICONS.has(icon)) {
    for (const [kind, icons] of Object.entries(ICONS)) {
      if (icons.has(icon)) return kind;
    }
  }

  if (/雷|冰雹/.test(text)) return "thunder";
  if (/雨夹雪|雨雪|雪/.test(text)) return "snow";
  if (/雨/.test(text)) return "rain";
  if (/沙尘|扬沙|浮尘/.test(text)) return "dust";
  if (/霾/.test(text)) return "haze";
  if (/雾/.test(text)) return "fog";
  if (/阴/.test(text)) return "overcast";
  if (/多云|少云/.test(text)) return "cloudy";
  if (/晴/.test(text)) return "clear";
  return "none";
}

function getPrecipitationType(kind, icon, text = "") {
  if (kind === "rain" || kind === "thunder") return "rain";
  if (kind !== "snow") return "none";
  if (icon !== null && ICONS.snow.has(icon)) return MIXED_ICONS.has(icon) ? "mixed" : "snow";
  if (/雨夹雪|雨雪/.test(text)) return "mixed";
  return "snow";
}

function resolveIntensity(kind, icon, precipFactor) {
  if (kind === "thunder") return Math.max(0.35, precipFactor);
  if (kind === "rain") return Math.max(0.15, precipFactor);
  if (kind === "snow") return Math.max(SNOW_MINIMUMS.get(icon) ?? 0.35, precipFactor);
  return 0;
}

function resolveClouds(kind, icon, value) {
  if (!CLOUD_KINDS.has(kind)) return { cloudFactor: 0, cloudLayers: 0 };

  const parsedCloud = parseFinite(value);
  if (parsedCloud !== null) {
    const cloudFactor = clamp(Math.max(0, parsedCloud) / 100, 0, 1);
    const rawLayers = cloudFactor < 0.4 ? 1 : cloudFactor < 0.65 ? 2 : 3;
    return {
      cloudFactor,
      cloudLayers: DARK_CLOUD_KINDS.has(kind) ? Math.max(2, rawLayers) : rawLayers
    };
  }

  const defaults = {
    101: [0.7, 3], 151: [0.7, 3],
    102: [0.35, 1], 152: [0.35, 1],
    103: [0.5, 2], 153: [0.5, 2],
    104: [0.9, 3]
  };
  const [cloudFactor, cloudLayers] = defaults[icon] || (DARK_CLOUD_KINDS.has(kind) ? [0.85, 3] : [0.5, 2]);
  return { cloudFactor, cloudLayers };
}

function resolveWindAngle(wind360, windDir) {
  const numeric = parseFinite(wind360);
  if (numeric !== null) return ((numeric % 360) + 360) % 360;
  if (/无持续风向|旋转风|静风/.test(String(windDir || ""))) return null;
  return WIND_ANGLES[windDir] ?? null;
}

function emptyScene() {
  return {
    kind: "none",
    isNight: false,
    precipitationType: "none",
    intensity: 0,
    cloudFactor: 0,
    cloudLayers: 0,
    windSpeed: 0,
    windFactor: 0,
    windDirectionX: 0,
    hasHorizontalWind: false,
    cloudDuration: 38,
    atmosphereDuration: 60,
    rainCount: 0,
    rainDuration: 1.2,
    rainOffsetX: 0,
    snowCount: 0,
    snowDuration: 5.5,
    snowOffsetX: 0,
    dustCount: 0,
    dustDuration: 9,
    dustOffsetX: 0
  };
}

function parseIcon(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFinite(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validNumber(value, fallback) {
  const parsed = parseFinite(value);
  return parsed === null || parsed < 0 ? fallback : parsed;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setOf(...values) {
  return new Set(values);
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
