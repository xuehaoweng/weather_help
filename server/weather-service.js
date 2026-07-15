import { QWeatherError } from "./qweather-client.js";
import { mockWeatherPayload } from "./mock-data.js";

const CORE_SPECS = [
  { source: "now", endpoint: "/v7/weather/now", ttlMs: 8 * 60 * 1000 },
  { source: "daily", endpoint: "/v7/weather/7d", ttlMs: 45 * 60 * 1000 },
  { source: "hourly", endpoint: "/v7/weather/24h", ttlMs: 30 * 60 * 1000 },
  { source: "warning", endpoint: "/v7/warning/now", ttlMs: 10 * 60 * 1000 }
];
const DETAIL_SPECS = [
  { source: "minutely", endpoint: "/v7/minutely/5m", ttlMs: 8 * 60 * 1000 },
  { source: "indices", endpoint: "/v7/indices/1d", ttlMs: 60 * 60 * 1000 }
];

export class WeatherInputError extends Error {
  constructor(message = "Invalid location coordinates") {
    super(message);
    this.name = "WeatherInputError";
    this.code = "INVALID_LOCATION";
    this.status = 400;
  }
}

export function createWeatherService({ client, apiHost = "devapi.qweather.com", useMock = false } = {}) {
  async function getCore(query) {
    return aggregate(CORE_SPECS, query, "CORE_WEATHER_UNAVAILABLE", enrichCore);
  }

  async function getDetails(query) {
    return aggregate(DETAIL_SPECS, query, "WEATHER_DETAILS_UNAVAILABLE", enrichDetails);
  }

  async function getFull(query) {
    return aggregate([...CORE_SPECS, ...DETAIL_SPECS], query, "WEATHER_DATA_UNAVAILABLE", enrichFull);
  }

  async function aggregate(specs, query, unavailableCode, insightBuilder) {
    const input = normalizeWeatherQuery(query);
    if (useMock) return mockResult(specs, input, insightBuilder);
    if (!client) throw new Error("Weather client is required outside mock mode");

    const settled = await Promise.allSettled(specs.map((item) => client.request(resolveSpec(item, input, apiHost))));
    const body = { location: input.location, point: input.point, errors: [] };
    settled.forEach((result, index) => {
      const source = specs[index].source;
      if (result.status === "fulfilled") body[source] = result.value;
      else {
        body[source] = null;
        body.errors.push(publicUpstreamError(source, result.reason, specs.length === 2));
      }
    });
    body.insight = insightBuilder(body);
    const allFailed = settled.every((result) => result.status === "rejected");
    if (allFailed) body.error = unavailableError(unavailableCode);
    return { status: allFailed ? 502 : 200, body };
  }

  return { getCore, getDetails, getFull };
}

export function normalizeWeatherQuery(query = {}) {
  const location = String(query.location || "101010100").trim() || "101010100";
  const hasLon = query.lon !== undefined && query.lon !== null && String(query.lon).trim() !== "";
  const hasLat = query.lat !== undefined && query.lat !== null && String(query.lat).trim() !== "";
  if (hasLon !== hasLat) throw new WeatherInputError();
  if (!hasLon) return { location, point: location, lon: "", lat: "" };

  const lonNumber = Number(query.lon);
  const latNumber = Number(query.lat);
  if (!Number.isFinite(lonNumber) || !Number.isFinite(latNumber) || lonNumber < -180 || lonNumber > 180 || latNumber < -90 || latNumber > 90) {
    throw new WeatherInputError();
  }
  const lon = lonNumber.toFixed(2);
  const lat = latNumber.toFixed(2);
  return { location, lon, lat, point: `${lon},${lat}` };
}

function resolveSpec(item, input, apiHost) {
  let params;
  if (item.source === "minutely") params = { location: input.point, lang: "zh" };
  else if (item.source === "indices") params = { location: input.location, type: "1,2,3,5,8,9,10,15", lang: "zh" };
  else if (item.source === "warning") params = { location: input.location, lang: "zh" };
  else params = { location: input.location, lang: "zh", unit: "m" };
  return { host: apiHost, endpoint: item.endpoint, params, ttlMs: item.ttlMs };
}

function mockResult(specs, input, insightBuilder) {
  const all = mockWeatherPayload(input.location, input.point);
  const body = { location: input.location, point: input.point, errors: [] };
  for (const item of specs) body[item.source] = all[item.source];
  body.insight = insightBuilder(body);
  return { status: 200, body };
}

function publicUpstreamError(source, error, detailsOnly) {
  return {
    source,
    code: error instanceof QWeatherError ? error.code : "UPSTREAM_NETWORK_ERROR",
    message: detailsOnly ? "Weather details are temporarily unavailable" : "Weather data is temporarily unavailable"
  };
}

function unavailableError(code) {
  const details = code === "WEATHER_DETAILS_UNAVAILABLE";
  return {
    code,
    message: details ? "Weather details are temporarily unavailable" : "Weather data is temporarily unavailable"
  };
}

function enrichCore(data) {
  const now = data.now?.now;
  const today = data.daily?.daily?.[0];
  const warnings = data.warning?.warning || [];
  const currentPrecip = Number(now?.precip || 0);
  return baseInsight(now, today, warnings, currentPrecip, buildTitle(now, null, warnings));
}

function enrichDetails(data) {
  const rain = rainInsight(data.minutely);
  return {
    rainSummary: data.minutely?.summary || (rain.firstRainAt ? "未来两小时有降水，请带伞" : "未来两小时暂无明显降水"),
    firstRainAt: rain.firstRainAt,
    maxPrecip: rain.maxPrecip
  };
}

function enrichFull(data) {
  const now = data.now?.now;
  const today = data.daily?.daily?.[0];
  const warnings = data.warning?.warning || [];
  const rain = rainInsight(data.minutely);
  return {
    ...baseInsight(now, today, warnings, rain.maxPrecip, buildTitle(now, rain.firstRainAt, warnings)),
    rainSummary: data.minutely?.summary || (rain.firstRainAt ? "未来两小时有降水，请带伞" : "未来两小时暂无明显降水"),
    firstRainAt: rain.firstRainAt,
    maxPrecip: rain.maxPrecip
  };
}

function rainInsight(minutelyPayload) {
  const minutely = minutelyPayload?.minutely || [];
  const firstRain = minutely.find((item) => Number(item.precip) > 0);
  return {
    firstRainAt: firstRain?.fxTime || null,
    maxPrecip: minutely.reduce((max, item) => Math.max(max, Number(item.precip || 0)), 0)
  };
}

function baseInsight(now, today, warnings, precip, title) {
  return {
    title,
    commuteScore: scoreCommute({
      temp: Number(now?.temp),
      text: now?.text || today?.textDay || "",
      wind: Number(now?.windSpeed || 0),
      precip,
      warningCount: warnings.length,
      uv: Number(today?.uvIndex || 0)
    }),
    warningCount: warnings.length,
    premiumNudges: [
      "订阅多个常用地点的雨前提醒",
      "添加上班、放学、遛狗、跑步等场景提醒",
      "获得周末户外活动窗口和家庭共享提醒"
    ]
  };
}

function buildTitle(now, firstRainAt, warnings) {
  if (warnings.length) return `${warnings[0].typeName || "天气"}预警，出门前先看风险`;
  if (firstRainAt) return "未来两小时可能下雨，建议提前安排出门";
  if (now?.text?.includes("晴")) return "天气适合出门，注意防晒和补水";
  return `${now?.text || "天气已更新"}，适合快速检查出门安排`;
}

function scoreCommute({ temp, text, wind, precip, warningCount, uv }) {
  let score = 92;
  if (warningCount) score -= 25;
  if (precip > 0.4) score -= 22;
  else if (precip > 0) score -= 12;
  if (wind > 28) score -= 10;
  if (temp >= 34 || temp <= 0) score -= 12;
  if (uv >= 8) score -= 6;
  if (/暴雨|大雨|雷|雪|冰雹|沙尘/.test(text)) score -= 14;
  const value = Math.max(35, Math.min(99, Math.round(score)));
  return { value, label: value >= 85 ? "顺畅" : value >= 70 ? "可出门" : value >= 55 ? "需准备" : "谨慎" };
}
