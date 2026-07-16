import test from "node:test";
import assert from "node:assert/strict";
import { buildWeatherInsight } from "./advice-engine.js";

const rainy = {
  now: {
    text: "中雨",
    temp: "27",
    feelsLike: "24",
    windSpeed: "28",
    precip: "2.4"
  },
  today: {
    textDay: "中雨",
    tempMin: "20",
    tempMax: "31",
    uvIndex: "11"
  },
  hourly: [
    { fxTime: "2026-07-16T10:00+08:00", text: "中雨", temp: "27", windSpeed: "28" }
  ],
  warnings: [],
  minutely: [
    { fxTime: "2026-07-16T10:55+08:00", precip: "0.8" },
    { fxTime: "2026-07-16T11:00+08:00", precip: "1.2" }
  ],
  indices: [
    { type: "1", name: "运动指数", category: "较不宜" },
    { type: "3", name: "穿衣指数", category: "舒适" }
  ],
  updatedAt: "2026-07-16T02:35:00.000Z",
  source: "Mock",
  isPartial: false
};

test("returns meaningfully different commute, outdoor, and family advice", () => {
  const insight = buildWeatherInsight(rainy);

  assert.match(insight.scenarios.commute.headline, /10:55|带伞|提前/);
  assert.match(insight.scenarios.outdoor.headline, /不适合|暂停|改期/);
  assert.match(insight.scenarios.family.headline, /家人|儿童|老人/);
  assert.notDeepEqual(insight.scenarios.commute.decisions, insight.scenarios.outdoor.decisions);
  assert.notDeepEqual(insight.scenarios.outdoor.decisions, insight.scenarios.family.decisions);
  assert.deepEqual(insight.scenarios.commute.decisions.map((item) => item.key), [
    "departure",
    "umbrella",
    "commute-risk"
  ]);
});

test("score factors explain the final bounded value", () => {
  const score = buildWeatherInsight(rainy).score;

  assert.equal(score.base, 92);
  assert.deepEqual(score.factors.map((item) => item.key), ["rain", "wind", "uv"]);
  assert.equal(score.value, score.base + score.factors.reduce((sum, item) => sum + item.impact, 0));
  assert.equal(score.label, "需准备");
});

test("exposes freshness, source, rain timing, and partial-data status", () => {
  const insight = buildWeatherInsight({ ...rainy, isPartial: true });

  assert.equal(insight.updatedAt, rainy.updatedAt);
  assert.equal(insight.source, "Mock");
  assert.equal(insight.isPartial, true);
  assert.equal(insight.firstRainAt, "2026-07-16T10:55+08:00");
  assert.equal(insight.maxPrecip, 1.2);
  assert.match(insight.rainSummary, /10:55|降雨|带伞/);
});

test("degrades safely when detailed weather data has not arrived", () => {
  const insight = buildWeatherInsight({
    now: { text: "晴", temp: "25", feelsLike: "26", windSpeed: "5", precip: "0" },
    today: { textDay: "晴", tempMin: "20", tempMax: "29", uvIndex: "5" },
    hourly: [],
    warnings: [],
    minutely: [],
    indices: [],
    updatedAt: rainy.updatedAt,
    source: "QWeather",
    isPartial: false
  });

  assert.equal(insight.firstRainAt, null);
  assert.equal(insight.score.value, 92);
  assert.equal(insight.scenarios.outdoor.decisions[2].status, "unknown");
  assert.match(insight.scenarios.outdoor.decisions[2].reason, /生活指数/);
  assert.doesNotMatch(insight.scenarios.family.headline, /治疗|诊断|保证/);
});

test("warnings become the leading risk across scenarios", () => {
  const insight = buildWeatherInsight({
    ...rainy,
    warnings: [{ typeName: "雷电" }]
  });

  assert.match(insight.title, /雷电预警/);
  assert.equal(insight.scenarios.commute.decisions[2].status, "danger");
  assert.equal(insight.scenarios.outdoor.decisions[0].status, "danger");
  assert.equal(insight.scenarios.family.decisions[0].status, "danger");
});
