import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createQWeatherClient, QWeatherError } from "./qweather-client.js";

const spec = {
  host: "api.example.test",
  endpoint: "/v7/weather/now",
  params: { location: "101200204" },
  ttlMs: 60_000
};

test("deduplicates concurrent requests", async (t) => {
  const cachePath = await temporaryCache(t);
  const pending = deferred();
  let calls = 0;
  const client = createQWeatherClient({
    apiKey: "secret",
    cachePath,
    fetchImpl: async () => {
      calls += 1;
      return pending.promise;
    }
  });

  const first = client.request(spec);
  const second = client.request(spec);
  pending.resolve(jsonResponse({ code: "200", marker: "shared" }));

  assert.deepEqual(await first, { code: "200", marker: "shared" });
  assert.deepEqual(await second, { code: "200", marker: "shared" });
  assert.equal(calls, 1);
  await client.close();
});

test("clears a rejected inflight request so the next call retries", async (t) => {
  const cachePath = await temporaryCache(t);
  let calls = 0;
  const client = createQWeatherClient({
    apiKey: "secret",
    cachePath,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return jsonResponse({ code: "200", marker: "retried" });
    }
  });

  await assert.rejects(client.request(spec), (error) => error instanceof QWeatherError && error.code === "UPSTREAM_NETWORK_ERROR");
  assert.equal((await client.request(spec)).marker, "retried");
  assert.equal(calls, 2);
  await client.close();
});

test("times out while reading the response body and retries later", async (t) => {
  const cachePath = await temporaryCache(t);
  let calls = 0;
  const client = createQWeatherClient({
    apiKey: "secret",
    cachePath,
    timeoutMs: 15,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return { ok: true, json: () => new Promise(() => {}) };
      return jsonResponse({ code: "200", marker: "after-timeout" });
    }
  });

  await assert.rejects(client.request(spec), (error) => error instanceof QWeatherError && error.code === "UPSTREAM_TIMEOUT");
  assert.equal((await client.request(spec)).marker, "after-timeout");
  assert.equal(calls, 2);
  await client.close();
});

test("falls back to a 4000ms timeout for invalid configuration", async (t) => {
  const cachePath = await temporaryCache(t);
  const scheduled = [];
  const client = createQWeatherClient({
    apiKey: "secret",
    cachePath,
    timeoutMs: 0,
    setTimeoutImpl: (_callback, ms) => {
      scheduled.push(ms);
      return 1;
    },
    clearTimeoutImpl: () => {},
    fetchImpl: async () => jsonResponse({ code: "200" })
  });

  await client.request(spec);
  assert.equal(scheduled[0], 4000);
  await client.close();
});

test("restores fresh disk cache without storing the API key", async (t) => {
  const cachePath = await temporaryCache(t);
  let firstCalls = 0;
  const first = createQWeatherClient({
    apiKey: "never-write-this-key",
    cachePath,
    now: () => 10_000,
    fetchImpl: async () => {
      firstCalls += 1;
      return jsonResponse({ code: "200", marker: "persisted" });
    }
  });
  await first.request(spec);
  await first.close();

  let secondCalls = 0;
  const second = createQWeatherClient({
    apiKey: "another-key",
    cachePath,
    now: () => 10_100,
    fetchImpl: async () => {
      secondCalls += 1;
      return jsonResponse({ code: "200", marker: "network" });
    }
  });

  assert.equal((await second.request(spec)).marker, "persisted");
  assert.equal(secondCalls, 0);
  assert.doesNotMatch(await fs.readFile(cachePath, "utf8"), /never-write-this-key/);
  await second.close();
  assert.equal(firstCalls, 1);
});

test("ignores corrupt, unknown-schema, and expired disk entries", async (t) => {
  const cachePath = await temporaryCache(t);
  const cases = [
    "not json",
    JSON.stringify({ schemaVersion: 99, entries: [] }),
    JSON.stringify({
      schemaVersion: 1,
      entries: [{ key: requestUrl(spec), cachedAt: 1, data: { code: "200", marker: "stale" } }]
    })
  ];

  for (const value of cases) {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, value);
    let calls = 0;
    const client = createQWeatherClient({
      apiKey: "secret",
      cachePath,
      now: () => 100_000,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ code: "200", marker: "fresh" });
      }
    });
    assert.equal((await client.request(spec)).marker, "fresh");
    assert.equal(calls, 1);
    await client.close();
  }
});

test("flushes the latest cache version when data changes during a write", async (t) => {
  const cachePath = await temporaryCache(t);
  const writeStarted = deferred();
  const releaseWrite = deferred();
  let pauses = 0;
  const client = createQWeatherClient({
    apiKey: "secret",
    cachePath,
    persistDelayMs: 0,
    beforeWrite: async () => {
      if (pauses++ === 0) {
        writeStarted.resolve();
        await releaseWrite.promise;
      }
    },
    fetchImpl: async (url) => jsonResponse({ code: "200", marker: new URL(url).searchParams.get("location") })
  });

  await client.request(spec);
  await writeStarted.promise;
  await client.request({ ...spec, params: { location: "101010100" } });
  releaseWrite.resolve();
  await client.close();

  const disk = JSON.parse(await fs.readFile(cachePath, "utf8"));
  assert.equal(disk.entries.length, 2);
  assert.deepEqual(disk.entries.map((entry) => entry.data.marker).sort(), ["101010100", "101200204"]);
});

test("disables persistence after a write failure without blocking close", async () => {
  let writeAttempts = 0;
  const fsImpl = {
    readFile: async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); },
    mkdir: async () => {},
    writeFile: async () => {
      writeAttempts += 1;
      if (writeAttempts === 1) throw Object.assign(new Error("readonly"), { code: "EACCES" });
    },
    rename: async () => {},
    rm: async () => {}
  };
  const client = createQWeatherClient({
    apiKey: "secret",
    cachePath: "/readonly/qweather.json",
    persistDelayMs: 0,
    fsImpl,
    fetchImpl: async () => jsonResponse({ code: "200" })
  });

  await client.request(spec);
  await client.close();
  assert.equal(writeAttempts, 1);
});

async function temporaryCache(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "weather-pro-cache-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return path.join(directory, "qweather.json");
}

function requestUrl({ host, endpoint, params }) {
  const url = new URL(`https://${host}${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function jsonResponse(data, ok = true, status = 200) {
  return { ok, status, json: async () => data };
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
