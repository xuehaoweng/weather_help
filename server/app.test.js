import test from "node:test";
import assert from "node:assert/strict";
import { createWeatherHandlers } from "./app.js";
import { createWeatherService } from "./weather-service.js";

test("weather handlers expose core, details, full, and validation contracts", async () => {
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true,
    apiHost: "mock.test"
  });

  const core = await handlers.weather({ location: "101020100", lon: "121.47", lat: "31.23" });
  assert.equal(core.status, 200);
  assert.ok(core.body.now);
  assert.equal(core.body.minutely, undefined);

  const details = await handlers.details({ location: "101020100", lon: "121.47", lat: "31.23" });
  assert.equal(details.status, 200);
  assert.ok(details.body.minutely);
  assert.equal(details.body.now, undefined);

  const full = await handlers.weather({ full: "true", location: "101020100", lon: "121.47", lat: "31.23" });
  assert.equal(full.status, 200);
  assert.ok(full.body.now);
  assert.ok(full.body.minutely);

  const invalid = await handlers.weather({ location: "x", lon: "999", lat: "31" });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "INVALID_LOCATION");
});

test("health and mock location search remain available", async () => {
  const handlers = createWeatherHandlers({
    weatherService: createWeatherService({ useMock: true }),
    useMock: true,
    apiHost: "mock.test"
  });

  assert.equal(handlers.health().body.mode, "mock");
  const locations = await handlers.locations({ q: "上海" });
  assert.equal(locations.status, 200);
  assert.equal(locations.body.locations[0].name, "上海");
  assert.equal((await handlers.locations({ q: "" })).status, 400);
});
