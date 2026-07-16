import { isStaleWeatherData, QWeatherError } from "./qweather-client.js";
import { mockWeatherPayload } from "./mock-data.js";
import { buildWeatherInsight } from "../shared/advice-engine.js";

const CORE_SPECS = [
  { source: "now", endpoint: "/v7/weather/now", ttlMs: 8 * 60 * 1000, staleIfErrorMs: 30 * 60 * 1000 },
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

export function createWeatherService({
  client,
  apiHost = "devapi.qweather.com",
  useMock = false,
  now = Date.now
} = {}) {
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
    if (useMock) return mockResult(specs, input, insightBuilder, now);
    if (!client) throw new Error("Weather client is required outside mock mode");

    const settled = await Promise.allSettled(specs.map((item) => client.request(resolveSpec(item, input, apiHost))));
    const body = { location: input.location, point: input.point, errors: [], staleSources: [] };
    settled.forEach((result, index) => {
      const source = specs[index].source;
      if (result.status === "fulfilled") {
        body[source] = result.value;
        if (isStaleWeatherData(result.value)) body.staleSources.push(source);
      }
      else {
        body[source] = null;
        body.errors.push(publicUpstreamError(source, result.reason, specs.length === 2));
      }
    });
    const allFailed = settled.every((result) => result.status === "rejected");
    body.insight = insightBuilder(body, {
      source: "QWeather",
      updatedAt: new Date(now()).toISOString(),
      isPartial: body.errors.length > 0
    });
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
  return {
    host: apiHost,
    endpoint: item.endpoint,
    params,
    ttlMs: item.ttlMs,
    staleIfErrorMs: item.staleIfErrorMs
  };
}

function mockResult(specs, input, insightBuilder, now) {
  const all = mockWeatherPayload(input.location, input.point);
  const body = { location: input.location, point: input.point, errors: [], staleSources: [] };
  for (const item of specs) body[item.source] = all[item.source];
  body.insight = insightBuilder(body, {
    source: "Mock",
    updatedAt: new Date(now()).toISOString(),
    isPartial: false
  });
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

function enrichCore(data, meta) {
  return buildInsight(data, meta);
}

function enrichDetails(data, meta) {
  const rain = rainInsight(data.minutely);
  return {
    rainSummary: data.minutely?.summary || (rain.firstRainAt ? "未来两小时有降水，请带伞" : "未来两小时暂无明显降水"),
    firstRainAt: rain.firstRainAt,
    maxPrecip: rain.maxPrecip,
    updatedAt: meta.updatedAt,
    source: meta.source,
    isPartial: meta.isPartial
  };
}

function enrichFull(data, meta) {
  return buildInsight(data, meta);
}

function rainInsight(minutelyPayload) {
  const minutely = minutelyPayload?.minutely || [];
  const firstRain = minutely.find((item) => Number(item.precip) > 0);
  return {
    firstRainAt: firstRain?.fxTime || null,
    maxPrecip: minutely.reduce((max, item) => Math.max(max, Number(item.precip || 0)), 0)
  };
}

function buildInsight(data, meta) {
  return buildWeatherInsight({
    now: data.now?.now,
    today: data.daily?.daily?.[0],
    hourly: data.hourly?.hourly || [],
    warnings: data.warning?.warning || [],
    minutely: data.minutely?.minutely || [],
    indices: data.indices?.daily || [],
    ...meta
  });
}
