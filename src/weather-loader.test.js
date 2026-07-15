import test from "node:test";
import assert from "node:assert/strict";
import { createLatestWeatherLoader } from "./weather-loader.js";

test("stale success cannot overwrite the latest request", async () => {
  const first = deferred();
  const second = deferred();
  const events = [];
  const loader = createLatestWeatherLoader(queueFetch(first.promise, second.promise));

  const firstLoad = loader.load(target("a"), callbacks("a", events));
  const secondLoad = loader.load(target("b"), callbacks("b", events));
  second.resolve(response({ city: "b" }));
  await secondLoad;
  first.resolve(response({ city: "a" }));
  await firstLoad;

  assert.deepEqual(events, ["a:loading", "b:loading", "b:success:b", "b:settled"]);
});

test("stale rejection cannot set error or finish the latest request", async () => {
  const first = deferred();
  const second = deferred();
  const events = [];
  const loader = createLatestWeatherLoader(queueFetch(first.promise, second.promise));

  const firstLoad = loader.load(target("a"), callbacks("a", events));
  const secondLoad = loader.load(target("b"), callbacks("b", events));
  first.reject(new Error("old failure"));
  await firstLoad;
  second.resolve(response({ city: "b" }));
  await secondLoad;

  assert.deepEqual(events, ["a:loading", "b:loading", "b:success:b", "b:settled"]);
});

test("AbortError is silent and does not settle stale UI", async () => {
  const pending = deferred();
  const events = [];
  const loader = createLatestWeatherLoader(queueFetch(pending.promise));
  const load = loader.load(target("a"), callbacks("a", events));
  const error = new Error("aborted");
  error.name = "AbortError";
  pending.reject(error);
  await load;
  assert.deepEqual(events, ["a:loading"]);
});

test("latest HTTP failure reports error and settles", async () => {
  const events = [];
  const loader = createLatestWeatherLoader(async () => response({ error: "天气坏了" }, false));
  await loader.load(target("a"), callbacks("a", events));
  assert.deepEqual(events, ["a:loading", "a:error:天气坏了", "a:settled"]);
});

test("cancel prevents every later write from the active request", async () => {
  const pending = deferred();
  const events = [];
  const loader = createLatestWeatherLoader(queueFetch(pending.promise));
  const load = loader.load(target("a"), callbacks("a", events));
  loader.cancel();
  pending.resolve(response({ city: "a" }));
  await load;
  assert.deepEqual(events, ["a:loading"]);
});

function callbacks(label, events) {
  return {
    onLoading: () => events.push(`${label}:loading`),
    onSuccess: (data) => events.push(`${label}:success:${data.city}`),
    onError: (error) => events.push(`${label}:error:${error.message}`),
    onSettled: () => events.push(`${label}:settled`)
  };
}

function target(id) {
  return { id, lon: "1", lat: "2" };
}

function response(data, ok = true) {
  return { ok, json: async () => data };
}

function queueFetch(...promises) {
  let index = 0;
  return () => promises[index++];
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
