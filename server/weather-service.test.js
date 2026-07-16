import test from "node:test";
import assert from "node:assert/strict";
import { QWeatherError } from "./qweather-client.js";
import { createWeatherService, WeatherInputError } from "./weather-service.js";

const query = { location: "101200204", lon: "111.84442", lat: "31.77692" };

test("core and details request independent upstream groups", async () => {
  const calls = [];
  const service = createWeatherService({
    client: fakeClient(calls),
    apiHost: "api.test",
    now: () => Date.parse("2026-07-16T02:35:00.000Z")
  });

  const core = await service.getCore(query);
  assert.deepEqual(calls, [
    "/v7/weather/now",
    "/v7/weather/7d",
    "/v7/weather/24h",
    "/v7/warning/now"
  ]);
  assert.equal(core.status, 200);
  assert.equal(core.body.minutely, undefined);
  assert.equal(core.body.indices, undefined);
  assert.ok(core.body.insight.scenarios.commute);
  assert.equal(core.body.insight.source, "QWeather");
  assert.equal(core.body.insight.updatedAt, "2026-07-16T02:35:00.000Z");
  assert.equal(core.body.insight.isPartial, false);

  calls.length = 0;
  const details = await service.getDetails(query);
  assert.deepEqual(calls, ["/v7/minutely/5m", "/v7/indices/1d"]);
  assert.equal(details.status, 200);
  assert.equal(details.body.now, undefined);
  assert.equal(details.body.insight.firstRainAt, "2026-07-15T15:00+08:00");
});

test("full mode requests all six groups and keeps rain-aware insight", async () => {
  const calls = [];
  const result = await createWeatherService({ client: fakeClient(calls), apiHost: "api.test" }).getFull(query);

  assert.equal(calls.length, 6);
  assert.equal(result.status, 200);
  assert.equal(result.body.insight.maxPrecip, 0.8);
  assert.match(result.body.insight.title, /下雨/);
  assert.match(result.body.insight.scenarios.outdoor.headline, /不适合|暂停|改期/);
  assert.equal(result.body.insight.source, "QWeather");
  assert.ok(result.body.minutely);
  assert.ok(result.body.indices);
});

test("partial upstream failure returns 200 with a structured public error", async () => {
  const service = createWeatherService({
    apiHost: "api.test",
    client: fakeClient([], new Set(["/v7/warning/now"]))
  });
  const result = await service.getCore(query);

  assert.equal(result.status, 200);
  assert.equal(result.body.warning, null);
  assert.deepEqual(result.body.errors, [{
    source: "warning",
    code: "UPSTREAM_TIMEOUT",
    message: "Weather data is temporarily unavailable"
  }]);
  assert.equal(result.body.insight.isPartial, true);
});

test("all failures return mode-specific 502 payloads", async () => {
  const service = createWeatherService({ client: failingClient(), apiHost: "api.test" });
  const cases = [
    [service.getCore(query), "CORE_WEATHER_UNAVAILABLE", ["now", "daily", "hourly", "warning"]],
    [service.getDetails(query), "WEATHER_DETAILS_UNAVAILABLE", ["minutely", "indices"]],
    [service.getFull(query), "WEATHER_DATA_UNAVAILABLE", ["now", "daily", "hourly", "warning", "minutely", "indices"]]
  ];

  for (const [pending, code, fields] of cases) {
    const result = await pending;
    assert.equal(result.status, 502);
    assert.equal(result.body.error.code, code);
    assert.equal(result.body.errors.length, fields.length);
    for (const field of fields) assert.equal(result.body[field], null);
  }
});

test("validates paired, finite, and bounded coordinates", async () => {
  const service = createWeatherService({ client: fakeClient([]), apiHost: "api.test" });
  const invalid = [
    { location: "x", lon: "111" },
    { location: "x", lat: "31" },
    { location: "x", lon: "NaN", lat: "31" },
    { location: "x", lon: "181", lat: "31" },
    { location: "x", lon: "111", lat: "91" }
  ];

  for (const value of invalid) {
    await assert.rejects(service.getCore(value), (error) => error instanceof WeatherInputError && error.code === "INVALID_LOCATION");
  }
  const fallback = await service.getCore({ location: "101010100" });
  assert.equal(fallback.body.point, "101010100");
});

test("mock mode exposes the same core, details, and full shapes", async () => {
  const service = createWeatherService({ useMock: true });
  const core = await service.getCore(query);
  const details = await service.getDetails(query);
  const full = await service.getFull(query);

  assert.deepEqual(Object.keys(core.body).filter((key) => ["now", "daily", "hourly", "warning"].includes(key)).sort(), ["daily", "hourly", "now", "warning"]);
  assert.ok(details.body.minutely);
  assert.ok(details.body.indices);
  assert.ok(full.body.now);
  assert.ok(full.body.minutely);
  assert.equal(full.body.insight.source, "Mock");
  assert.ok(full.body.insight.scenarios.family);
});

function fakeClient(calls, failures = new Set()) {
  return {
    async request(spec) {
      calls.push(spec.endpoint);
      if (failures.has(spec.endpoint)) throw new QWeatherError("UPSTREAM_TIMEOUT", "secret upstream detail");
      return payloadFor(spec.endpoint);
    }
  };
}

function failingClient() {
  return { request: async () => { throw new QWeatherError("UPSTREAM_NETWORK_ERROR", "internal URL and key"); } };
}

function payloadFor(endpoint) {
  if (endpoint.endsWith("/now") && endpoint.includes("weather")) {
    return { code: "200", now: { text: "晴", temp: "25", windSpeed: "8", precip: "0", icon: "100" } };
  }
  if (endpoint.endsWith("/7d")) return { code: "200", daily: [{ textDay: "晴", uvIndex: "5" }] };
  if (endpoint.endsWith("/24h")) return { code: "200", hourly: [] };
  if (endpoint.includes("warning")) return { code: "200", warning: [] };
  if (endpoint.includes("minutely")) {
    return { code: "200", summary: "未来两小时有雨", minutely: [{ fxTime: "2026-07-15T15:00+08:00", precip: "0.8" }] };
  }
  return { code: "200", daily: [{ type: "1", category: "适宜" }] };
}
