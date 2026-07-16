import test from "node:test";
import assert from "node:assert/strict";
import { createLatestWeatherLoader, mergeWeatherData } from "./weather-loader.js";

test("merges details, recomputes complete advice, and preserves errors", () => {
  const core = {
    location: "a",
    now: { now: { text: "晴", temp: "25", feelsLike: "26", windSpeed: "5", precip: "0" } },
    daily: { daily: [{ textDay: "晴", uvIndex: "5" }] },
    hourly: { hourly: [] },
    warning: { warning: [] },
    insight: {
      title: "适合出门",
      commuteScore: { value: 92 },
      updatedAt: "2026-07-16T02:35:00.000Z",
      source: "QWeather",
      isPartial: false
    },
    errors: [{ source: "warning" }]
  };
  const details = {
    location: "a",
    minutely: {
      minutely: [{ fxTime: "2026-07-16T10:55+08:00", precip: "0.8" }]
    },
    indices: { daily: [{ type: "1", category: "较不宜" }] },
    insight: { rainSummary: "两小时有雨", maxPrecip: 0.8 },
    errors: [{ source: "indices" }]
  };

  const merged = mergeWeatherData(core, details);
  assert.equal(merged.insight.firstRainAt, "2026-07-16T10:55+08:00");
  assert.match(merged.insight.scenarios.commute.headline, /10:55|带伞|提前/);
  assert.equal(merged.insight.source, "QWeather");
  assert.equal(merged.insight.isPartial, true);
  assert.deepEqual(merged.errors, [...core.errors, ...details.errors]);
});

test("buffers details until matching core succeeds", async () => {
  const core = deferred();
  const details = deferred();
  const events = [];
  const loader = createLatestWeatherLoader(routeFetch({ b: { core, details } }));
  const load = loader.load(target("b"), callbacks("b", events));

  details.resolve(response({ location: "b", minutely: { minutely: [] } }));
  await tick();
  assert.deepEqual(events, ["b:loading"]);

  core.resolve(response({ location: "b", now: { now: {} } }));
  await load;
  assert.deepEqual(events, ["b:loading", "b:core:b", "b:core-settled", "b:details:b", "b:details-settled"]);
});

test("details failure is local after core success", async () => {
  const events = [];
  const loader = createLatestWeatherLoader(async (url) => {
    if (url.includes("/details")) {
      return response({ error: { code: "WEATHER_DETAILS_UNAVAILABLE", message: "详情暂不可用" } }, false);
    }
    return response({ location: "a", now: { now: {} } });
  });

  await loader.load(target("a"), callbacks("a", events));
  assert.deepEqual(events, [
    "a:loading",
    "a:core:a",
    "a:core-settled",
    "a:details-error:详情暂不可用",
    "a:details-settled"
  ]);
});

test("a new city's details never merge with the previous city's core", async () => {
  const bCore = deferred();
  const bDetails = deferred();
  const events = [];
  const loader = createLatestWeatherLoader(routeFetch({
    a: {
      core: resolved(response({ location: "a", now: { now: {} } })),
      details: resolved(response({ location: "a", minutely: { minutely: [] } }))
    },
    b: { core: bCore, details: bDetails }
  }));

  await loader.load(target("a"), callbacks("a", events));
  const bLoad = loader.load(target("b"), callbacks("b", events));
  bDetails.resolve(response({ location: "b", minutely: { minutely: [] } }));
  await tick();
  assert.deepEqual(events.slice(-1), ["b:loading"]);

  bCore.resolve(response({ location: "b", now: { now: {} } }));
  await bLoad;
  assert.deepEqual(events.slice(-4), ["b:core:b", "b:core-settled", "b:details:b", "b:details-settled"]);
});

test("stale core, details, errors, and finally callbacks cannot write", async () => {
  const aCore = deferred();
  const aDetails = deferred();
  const events = [];
  const loader = createLatestWeatherLoader(routeFetch({
    a: { core: aCore, details: aDetails },
    b: {
      core: resolved(response({ location: "b" })),
      details: resolved(response({ location: "b" }))
    }
  }));

  const aLoad = loader.load(target("a"), callbacks("a", events));
  await loader.load(target("b"), callbacks("b", events));
  aCore.resolve(response({ location: "a" }));
  aDetails.reject(new Error("old failure"));
  await aLoad;

  assert.deepEqual(events, [
    "a:loading",
    "b:loading",
    "b:core:b",
    "b:core-settled",
    "b:details:b",
    "b:details-settled"
  ]);
});

test("core failure suppresses already buffered details", async () => {
  const core = deferred();
  const details = deferred();
  const events = [];
  const loader = createLatestWeatherLoader(routeFetch({ a: { core, details } }));
  const load = loader.load(target("a"), callbacks("a", events));
  details.resolve(response({ location: "a" }));
  await tick();
  core.resolve(response({ error: { message: "核心天气失败" } }, false));
  await load;

  assert.deepEqual(events, ["a:loading", "a:core-error:核心天气失败", "a:core-settled"]);
});

test("cancel prevents every later callback", async () => {
  const core = deferred();
  const details = deferred();
  const events = [];
  const loader = createLatestWeatherLoader(routeFetch({ a: { core, details } }));
  const load = loader.load(target("a"), callbacks("a", events));
  loader.cancel();
  core.resolve(response({ location: "a" }));
  details.resolve(response({ location: "a" }));
  await load;
  assert.deepEqual(events, ["a:loading"]);
});

function callbacks(label, events) {
  return {
    onLoading: () => events.push(`${label}:loading`),
    onCoreSuccess: (data) => events.push(`${label}:core:${data.location}`),
    onCoreError: (error) => events.push(`${label}:core-error:${error.message}`),
    onCoreSettled: () => events.push(`${label}:core-settled`),
    onDetailsSuccess: (data) => events.push(`${label}:details:${data.location}`),
    onDetailsError: (error) => events.push(`${label}:details-error:${error.message}`),
    onDetailsSettled: () => events.push(`${label}:details-settled`)
  };
}

function routeFetch(routes) {
  return (url) => {
    const parsed = new URL(url, "http://weather.test");
    const id = parsed.searchParams.get("location");
    const phase = parsed.pathname.endsWith("/details") ? "details" : "core";
    return routes[id][phase].promise;
  };
}

function target(id) {
  return { id, lon: "1", lat: "2" };
}

function response(data, ok = true) {
  return { ok, json: async () => data };
}

function resolved(value) {
  return { promise: Promise.resolve(value) };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}
