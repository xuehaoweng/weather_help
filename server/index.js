import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchesMockLocation, mockLocations, mockWeatherPayload } from "./mock-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

loadEnv(path.join(rootDir, ".env"));

const app = express();
const port = Number(process.env.PORT || 8787);
const cache = new Map();

const apiHost = process.env.QWEATHER_API_HOST || "devapi.qweather.com";
const geoHost = process.env.QWEATHER_GEO_HOST || "geoapi.qweather.com";
const apiKey = process.env.QWEATHER_API_KEY;
const useMock = process.env.QWEATHER_MOCK === "true" || !apiKey;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: useMock ? "mock" : "qweather",
    apiHost,
    hasApiKey: Boolean(apiKey),
    hasProjectId: Boolean(process.env.QWEATHER_PROJECT_ID),
    hasCredentialId: Boolean(process.env.QWEATHER_CREDENTIAL_ID)
  });
});

app.get("/api/locations", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) return res.status(400).json({ error: "请输入城市、区县或经纬度" });

    if (useMock) {
      return res.json({
        locations: mockLocations.filter((item) => matchesMockLocation(item, query)).slice(0, 8),
        refer: { sources: ["Mock"], license: ["MIT"] }
      });
    }

    const geoEndpoint = geoHost.includes("geoapi.qweather.com") ? "/v2/city/lookup" : "/geo/v2/city/lookup";
    const data = await qweather(geoHost, geoEndpoint, {
      location: query,
      range: String(req.query.range || "cn"),
      number: "8",
      lang: "zh"
    }, 60 * 60 * 1000);

    res.json({
      locations: data.location || [],
      refer: data.refer || null
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/api/weather", async (req, res) => {
  try {
    const location = String(req.query.location || "101010100").trim();
    const lon = req.query.lon ? String(req.query.lon) : "";
    const lat = req.query.lat ? String(req.query.lat) : "";
    const point = lon && lat ? `${Number(lon).toFixed(2)},${Number(lat).toFixed(2)}` : location;

    if (useMock) {
      return res.json(enrichWeather(mockWeatherPayload(location, point)));
    }

    const [now, daily, hourly, warning, minutely, indices] = await Promise.allSettled([
      qweather(apiHost, "/v7/weather/now", { location, lang: "zh", unit: "m" }, 8 * 60 * 1000),
      qweather(apiHost, "/v7/weather/7d", { location, lang: "zh", unit: "m" }, 45 * 60 * 1000),
      qweather(apiHost, "/v7/weather/24h", { location, lang: "zh", unit: "m" }, 30 * 60 * 1000),
      qweather(apiHost, "/v7/warning/now", { location, lang: "zh" }, 10 * 60 * 1000),
      qweather(apiHost, "/v7/minutely/5m", { location: point, lang: "zh" }, 8 * 60 * 1000),
      qweather(apiHost, "/v7/indices/1d", { location, type: "1,2,3,5,8,9,10,15", lang: "zh" }, 60 * 60 * 1000)
    ]);

    const payload = {
      location,
      point,
      now: unwrap(now),
      daily: unwrap(daily),
      hourly: unwrap(hourly),
      warning: unwrap(warning),
      minutely: unwrap(minutely),
      indices: unwrap(indices),
      errors: [now, daily, hourly, warning, minutely, indices]
        .filter((item) => item.status === "rejected")
        .map((item) => item.reason.message)
    };

    res.json(enrichWeather(payload));
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

if (process.env.NODE_ENV === "production") {
  const distDir = path.join(rootDir, "dist");
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Weather API listening on http://0.0.0.0:${port}`);
});

async function qweather(host, endpoint, params, ttlMs) {
  if (!apiKey) throw new Error("缺少 QWEATHER_API_KEY");

  const url = new URL(`https://${host}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }

  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < ttlMs) return cached.data;

  const response = await fetch(url, {
    headers: {
      "X-QW-Api-Key": apiKey,
      "Accept-Encoding": "gzip"
    }
  });

  if (!response.ok) {
    throw new Error(`和风接口请求失败 ${response.status}: ${endpoint}`);
  }

  const data = await response.json();
  if (data.code && data.code !== "200") {
    throw new Error(`和风接口返回 ${data.code}: ${endpoint}`);
  }

  cache.set(cacheKey, { time: Date.now(), data });
  return data;
}

function unwrap(result) {
  return result.status === "fulfilled" ? result.value : null;
}

function enrichWeather(data) {
  const now = data.now?.now;
  const today = data.daily?.daily?.[0];
  const minutely = data.minutely?.minutely || [];
  const rainSlots = minutely.filter((item) => Number(item.precip) > 0);
  const firstRain = rainSlots[0];
  const maxPrecip = minutely.reduce((max, item) => Math.max(max, Number(item.precip || 0)), 0);
  const warnings = data.warning?.warning || [];

  const commuteScore = scoreCommute({
    temp: Number(now?.temp),
    text: now?.text || today?.textDay || "",
    wind: Number(now?.windSpeed || 0),
    precip: maxPrecip,
    warningCount: warnings.length,
    uv: Number(today?.uvIndex || 0)
  });

  return {
    ...data,
    insight: {
      title: buildTitle(now, firstRain, warnings),
      commuteScore,
      rainSummary: data.minutely?.summary || (firstRain ? "未来两小时有降水，请带伞" : "未来两小时暂无明显降水"),
      firstRainAt: firstRain?.fxTime || null,
      maxPrecip,
      warningCount: warnings.length,
      premiumNudges: [
        "订阅多个常用地点的雨前提醒",
        "添加上班、放学、遛狗、跑步等场景提醒",
        "获得周末户外活动窗口和家庭共享提醒"
      ]
    }
  };
}

function buildTitle(now, firstRain, warnings) {
  if (warnings.length) return `${warnings[0].typeName || "天气"}预警，出门前先看风险`;
  if (firstRain) return "未来两小时可能下雨，建议提前安排出门";
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

  const bounded = Math.max(35, Math.min(99, Math.round(score)));
  const label = bounded >= 85 ? "顺畅" : bounded >= 70 ? "可出门" : bounded >= 55 ? "需准备" : "谨慎";
  return { value: bounded, label };
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").trim();
  }
}
