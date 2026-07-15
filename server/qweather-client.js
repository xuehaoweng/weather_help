import fs from "node:fs/promises";
import path from "node:path";

const CACHE_SCHEMA_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 4000;

export class QWeatherError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "QWeatherError";
    this.code = code;
  }
}

export function createQWeatherClient(options = {}) {
  const {
    apiKey,
    fetchImpl = fetch,
    cachePath = path.resolve(".cache/qweather.json"),
    now = Date.now,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    persistDelayMs = 40,
    beforeWrite = async () => {},
    fsImpl = fs
  } = options;
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const memory = new Map();
  const inflight = new Map();
  let version = 0;
  let persistedVersion = 0;
  let persistTimer = null;
  let writePromise = null;
  let persistenceDisabled = false;

  const ready = restoreDiskCache();

  async function request({ host, endpoint, params = {}, ttlMs }) {
    if (!apiKey) throw new QWeatherError("MISSING_API_KEY", "Weather service is not configured");
    await ready;

    const url = buildUrl(host, endpoint, params);
    const cached = memory.get(url);
    if (isFresh(cached, ttlMs, now())) return cached.data;
    if (inflight.has(url)) return inflight.get(url);

    const pending = fetchAndCache(url).finally(() => {
      if (inflight.get(url) === pending) inflight.delete(url);
    });
    inflight.set(url, pending);
    return pending;
  }

  async function fetchAndCache(url) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeoutImpl(() => {
        controller.abort();
        reject(new QWeatherError("UPSTREAM_TIMEOUT", "Weather provider timed out"));
      }, timeoutMs);
    });

    try {
      const data = await Promise.race([readResponse(url, controller.signal), timeout]);
      memory.set(url, { cachedAt: now(), data });
      version += 1;
      schedulePersist();
      return data;
    } finally {
      clearTimeoutImpl(timer);
    }
  }

  async function readResponse(url, signal) {
    try {
      const response = await fetchImpl(url, {
        signal,
        headers: {
          "X-QW-Api-Key": apiKey,
          "Accept-Encoding": "gzip"
        }
      });
      if (!response.ok) {
        throw new QWeatherError("UPSTREAM_HTTP_ERROR", `Weather provider returned HTTP ${response.status}`);
      }
      let data;
      try {
        data = await response.json();
      } catch (error) {
        if (signal.aborted) throw error;
        throw new QWeatherError("UPSTREAM_INVALID_RESPONSE", "Weather provider returned invalid JSON", error);
      }
      if (!data || typeof data !== "object" || (data.code && data.code !== "200")) {
        throw new QWeatherError("UPSTREAM_INVALID_RESPONSE", "Weather provider returned an invalid payload");
      }
      return data;
    } catch (error) {
      if (error instanceof QWeatherError) throw error;
      if (signal.aborted || error?.name === "AbortError") {
        throw new QWeatherError("UPSTREAM_TIMEOUT", "Weather provider timed out", error);
      }
      throw new QWeatherError("UPSTREAM_NETWORK_ERROR", "Weather provider is unreachable", error);
    }
  }

  function schedulePersist() {
    if (persistenceDisabled || persistTimer !== null || writePromise) return;
    persistTimer = setTimeoutImpl(() => {
      persistTimer = null;
      ensureFlush().catch(() => {});
    }, Math.max(0, Number(persistDelayMs) || 0));
  }

  function ensureFlush() {
    if (persistenceDisabled) {
      persistedVersion = version;
      return Promise.resolve();
    }
    if (writePromise) return writePromise;
    writePromise = (async () => {
      while (persistedVersion < version) {
        const targetVersion = version;
        const snapshot = serializeCache(memory);
        await beforeWrite(snapshot, targetVersion);
        await writeSnapshot(snapshot);
        persistedVersion = targetVersion;
      }
    })()
      .catch(() => {
        persistenceDisabled = true;
        persistedVersion = version;
      })
      .finally(() => {
        writePromise = null;
        if (!persistenceDisabled && persistedVersion < version) schedulePersist();
      });
    return writePromise;
  }

  async function writeSnapshot(snapshot) {
    const directory = path.dirname(cachePath);
    const temporary = `${cachePath}.${process.pid}.${version}.${Math.random().toString(16).slice(2)}.tmp`;
    await fsImpl.mkdir(directory, { recursive: true });
    try {
      await fsImpl.writeFile(temporary, JSON.stringify(snapshot), "utf8");
      await fsImpl.rename(temporary, cachePath);
    } finally {
      await fsImpl.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async function restoreDiskCache() {
    try {
      const parsed = JSON.parse(await fsImpl.readFile(cachePath, "utf8"));
      if (parsed?.schemaVersion !== CACHE_SCHEMA_VERSION || !Array.isArray(parsed.entries)) return;
      for (const entry of parsed.entries) {
        if (
          typeof entry?.key === "string" &&
          Number.isFinite(entry?.cachedAt) &&
          entry.cachedAt >= 0 &&
          entry.data &&
          typeof entry.data === "object"
        ) {
          memory.set(entry.key, { cachedAt: entry.cachedAt, data: entry.data });
        }
      }
    } catch {
      // Missing or corrupt disk cache degrades to memory-only operation.
    }
  }

  async function close() {
    await ready;
    if (persistTimer !== null) {
      clearTimeoutImpl(persistTimer);
      persistTimer = null;
    }
    do {
      await ensureFlush();
    } while (persistedVersion < version);
  }

  return { request, close };
}

function normalizeTimeout(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TIMEOUT_MS;
}

function buildUrl(host, endpoint, params) {
  const url = new URL(`https://${host}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function isFresh(entry, ttlMs, currentTime) {
  return Boolean(entry) && Number.isFinite(ttlMs) && ttlMs > 0 && currentTime - entry.cachedAt < ttlMs;
}

function serializeCache(memory) {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    entries: [...memory].map(([key, entry]) => ({ key, cachedAt: entry.cachedAt, data: entry.data }))
  };
}
