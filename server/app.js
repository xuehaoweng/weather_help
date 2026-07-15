import express from "express";
import path from "node:path";
import { matchesMockLocation, mockLocations } from "./mock-data.js";
import { WeatherInputError } from "./weather-service.js";

export function createWeatherApp({
  weatherService,
  useMock = false,
  apiHost = "devapi.qweather.com",
  health = {},
  lookupLocations,
  productionDir
}) {
  const app = express();
  const handlers = createWeatherHandlers({ weatherService, useMock, apiHost, health, lookupLocations });
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    const result = handlers.health();
    res.status(result.status).json(result.body);
  });

  app.get("/api/locations", async (req, res) => {
    const result = await handlers.locations(req.query);
    return res.status(result.status).json(result.body);
  });

  app.get("/api/weather/details", expressRoute((query) => handlers.details(query)));
  app.get("/api/weather", expressRoute((query) => handlers.weather(query)));

  if (productionDir) {
    app.use(express.static(productionDir));
    app.get("*", (_req, res) => res.sendFile(path.join(productionDir, "index.html")));
  }

  return app;
}

export function createWeatherHandlers({
  weatherService,
  useMock = false,
  apiHost = "devapi.qweather.com",
  health = {},
  lookupLocations
}) {
  return {
    health: () => ({ status: 200, body: { ok: true, mode: useMock ? "mock" : "qweather", apiHost, ...health } }),
    weather: (query) => safeResult(() => query.full === "true" ? weatherService.getFull(query) : weatherService.getCore(query)),
    details: (query) => safeResult(() => weatherService.getDetails(query)),
    locations: (query) => safeResult(async () => {
      const keyword = String(query.q || "").trim();
      if (!keyword) throw new WeatherInputError("请输入城市、区县或经纬度");
      if (useMock) {
        return {
          status: 200,
          body: {
            locations: mockLocations.filter((item) => matchesMockLocation(item, keyword)).slice(0, 8),
            refer: { sources: ["Mock"], license: ["MIT"] }
          }
        };
      }
      const data = await lookupLocations(keyword, query);
      return { status: 200, body: { locations: data.location || [], refer: data.refer || null } };
    })
  };
}

function expressRoute(run) {
  return async (req, res) => {
    const result = await run(req.query);
    return res.status(result.status).json(result.body);
  };
}

async function safeResult(run) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof WeatherInputError || error?.code === "INVALID_LOCATION") {
      return { status: 400, body: { error: { code: "INVALID_LOCATION", message: error.message } } };
    }
    return {
      status: 502,
      body: { error: { code: "UPSTREAM_NETWORK_ERROR", message: "Weather data is temporarily unavailable" } }
    };
  }
}
