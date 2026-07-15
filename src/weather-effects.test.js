import test from "node:test";
import assert from "node:assert/strict";
import { resolveWeatherScene } from "./weather-effects.js";

const expectedIcons = {
  clear: [100, 150],
  cloudy: [101, 102, 103, 151, 152, 153],
  overcast: [104],
  thunder: [302, 303, 304],
  rain: [300, 301, ...range(305, 318), 350, 351, 399],
  snow: [...range(400, 410), 456, 457, 499],
  fog: [500, 501, 509, 510, 514, 515],
  haze: [502, 511, 512, 513],
  dust: [503, 504, 507, 508]
};

for (const [kind, icons] of Object.entries(expectedIcons)) {
  test(`${kind} maps every official icon`, () => {
    for (const icon of icons) {
      assert.equal(resolveWeatherScene({ icon: String(icon) }, "success").kind, kind, `icon ${icon}`);
    }
  });
}

test("known icon wins over contradictory text and precipitation", () => {
  const scene = resolveWeatherScene({ icon: "101", text: "雷阵雨", precip: "2" }, "success");
  assert.equal(scene.kind, "cloudy");
  assert.equal(scene.precipitationType, "none");
});

test("special and unknown icons use ordered text fallback", () => {
  const cases = [
    ["900", "雷阵雨伴有冰雹", "thunder"],
    ["901", "雨夹雪", "snow"],
    ["999", "中雨", "rain"],
    ["777", "扬沙", "dust"],
    [undefined, "严重霾", "haze"],
    [undefined, "浓雾", "fog"],
    [undefined, "阴", "overcast"],
    [undefined, "少云", "cloudy"],
    [undefined, "晴", "clear"],
    [undefined, "未知", "none"]
  ];

  for (const [icon, text, kind] of cases) {
    assert.equal(resolveWeatherScene({ icon, text }, "success").kind, kind, `${icon}/${text}`);
  }
});

test("non-success and missing now safely resolve to none", () => {
  assert.equal(resolveWeatherScene({ icon: "100" }, "loading").kind, "none");
  assert.equal(resolveWeatherScene({ icon: "306" }, "error").kind, "none");
  assert.equal(resolveWeatherScene(null, "success").kind, "none");
});

test("night and mixed precipitation variants are explicit", () => {
  for (const icon of [150, 151, 152, 153, 350, 351, 456, 457]) {
    assert.equal(resolveWeatherScene({ icon: String(icon) }, "success").isNight, true, `icon ${icon}`);
  }
  for (const icon of [404, 405, 406, 456]) {
    const scene = resolveWeatherScene({ icon: String(icon) }, "success");
    assert.equal(scene.precipitationType, "mixed", `icon ${icon}`);
    assert.ok(scene.rainCount <= Math.ceil(72 * 0.25), `mixed rain cap ${icon}`);
  }
  assert.equal(resolveWeatherScene({ text: "晴" }, "success").isNight, false);
});

test("wind angles map to screen horizontal direction", () => {
  const north = resolveWeatherScene(rain({ wind360: "0", windSpeed: "25" }), "success");
  const east = resolveWeatherScene(rain({ wind360: "90", windSpeed: "25" }), "success");
  const south = resolveWeatherScene(rain({ wind360: "180", windSpeed: "25" }), "success");
  const west = resolveWeatherScene(rain({ wind360: "270", windSpeed: "25" }), "success");
  assert.ok(Math.abs(north.windDirectionX) < 1e-10);
  assert.ok(east.windDirectionX < 0);
  assert.ok(Math.abs(south.windDirectionX) < 1e-10);
  assert.ok(west.windDirectionX > 0);
  assert.ok(east.rainOffsetX < 0);
  assert.ok(west.rainOffsetX > 0);
});

test("Chinese wind direction is a fallback and invalid values are finite", () => {
  assert.ok(resolveWeatherScene(rain({ windDir: "东风", windSpeed: "20" }), "success").windDirectionX < 0);
  assert.ok(resolveWeatherScene(rain({ windDir: "西风", windSpeed: "20" }), "success").windDirectionX > 0);
  const invalid = resolveWeatherScene(rain({ wind360: "nope", windSpeed: "-10", precip: "NaN", cloud: "999" }), "success");
  for (const value of Object.values(invalid)) {
    if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
  assert.equal(invalid.windFactor, 0);
  assert.equal(invalid.cloudFactor, 1);
});

test("cloud defaults and category minimum layers are stable", () => {
  assert.equal(resolveWeatherScene({ icon: "102" }, "success").cloudLayers, 1);
  assert.equal(resolveWeatherScene({ icon: "103" }, "success").cloudLayers, 2);
  assert.equal(resolveWeatherScene({ icon: "101" }, "success").cloudLayers, 3);
  for (const icon of [104, 306, 400, 302]) {
    assert.equal(resolveWeatherScene({ icon: String(icon), cloud: "10" }, "success").cloudLayers, 2);
  }
  assert.equal(resolveWeatherScene({ icon: "101", cloud: "40" }, "success").cloudLayers, 2);
  assert.equal(resolveWeatherScene({ icon: "101", cloud: "80" }, "success").cloudLayers, 3);
});

test("rain formulas match zero midpoint and capped inputs", () => {
  const low = resolveWeatherScene(rain({ precip: "0", windSpeed: "0" }), "success");
  assert.equal(low.intensity, 0.15);
  assert.equal(low.rainCount, 31);
  close(low.rainDuration, 1.0975);
  assert.equal(low.rainOffsetX, 0);

  const mid = resolveWeatherScene(rain({ precip: "2.5", wind360: "90", windSpeed: "25" }), "success");
  assert.equal(mid.intensity, 0.5);
  assert.equal(mid.rainCount, 48);
  close(mid.rainDuration, 0.85);
  close(mid.rainOffsetX, -90);

  const capped = resolveWeatherScene(rain({ precip: "999", wind360: "270", windSpeed: "999" }), "success");
  assert.equal(capped.intensity, 1);
  assert.equal(capped.rainCount, 72);
  assert.equal(capped.rainOffsetX, 180);
  assert.ok(capped.rainDuration >= 0.55 && capped.rainDuration <= 1.2);
  assert.equal(resolveWeatherScene(rain({ precip: "999" }), "success", { compact: true }).rainCount, 40);
});

test("snow icon minimums and formulas are monotonic and capped", () => {
  const minimums = new Map([
    [400, 0.2], [407, 0.2], [457, 0.2], [401, 0.4], [402, 0.65], [403, 0.9],
    [408, 0.3], [409, 0.55], [410, 0.8], [404, 0.35], [405, 0.35], [406, 0.35], [456, 0.35], [499, 0.35]
  ]);
  for (const [icon, intensity] of minimums) {
    assert.equal(resolveWeatherScene({ icon: String(icon), precip: "0" }, "success").intensity, intensity, `icon ${icon}`);
  }
  const strong = resolveWeatherScene({ icon: "403", precip: "99", wind360: "90", windSpeed: "99" }, "success");
  assert.equal(strong.snowCount, 56);
  assert.equal(strong.snowOffsetX, -140);
  assert.ok(strong.snowDuration >= 2.8 && strong.snowDuration <= 5.5);
  assert.equal(resolveWeatherScene({ icon: "403", precip: "99" }, "success", { compact: true }).snowCount, 32);
});

test("cloud atmosphere and dust durations follow bounded wind formulas", () => {
  const calmCloud = resolveWeatherScene({ icon: "101", wind360: "90", windSpeed: "0" }, "success");
  const windyCloud = resolveWeatherScene({ icon: "101", wind360: "90", windSpeed: "50" }, "success");
  assert.equal(calmCloud.cloudDuration, 38);
  assert.equal(windyCloud.cloudDuration, 10);

  const fog = resolveWeatherScene({ icon: "501", wind360: "90", windSpeed: "25" }, "success");
  assert.equal(fog.atmosphereDuration, 42);

  const dust = resolveWeatherScene({ icon: "503", wind360: "270", windSpeed: "25" }, "success");
  assert.equal(dust.dustCount, 22);
  assert.equal(dust.dustDuration, 6);
  close(dust.dustOffsetX, 280);
  assert.equal(resolveWeatherScene({ icon: "503", windSpeed: "0" }, "success").dustCount, 0);
  assert.equal(resolveWeatherScene({ icon: "503", wind360: "270", windSpeed: "50" }, "success", { compact: true }).dustCount, 18);
});

function rain(overrides = {}) {
  return { icon: "306", precip: "1", cloud: "90", ...overrides };
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
}
