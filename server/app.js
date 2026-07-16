import express from "express";
import path from "node:path";
import { readSessionCookie, serializeSessionCookie } from "./admin-auth.js";
import { findNearestMockLocation, matchesMockLocation, mockLocations } from "./mock-data.js";
import { WeatherInputError } from "./weather-service.js";

export function createWeatherApp({
  weatherService,
  useMock = false,
  apiHost = "devapi.qweather.com",
  health = {},
  lookupLocations,
  analyticsStore,
  analyticsEnabled = false,
  adminAuth,
  startedAt,
  productionDir
}) {
  const app = express();
  const handlers = createWeatherHandlers({
    weatherService,
    useMock,
    apiHost,
    health,
    lookupLocations,
    analyticsStore,
    analyticsEnabled,
    adminAuth,
    startedAt
  });
  app.use(express.json({ limit: "4kb" }));

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
  app.post("/api/analytics/events", async (req, res) => {
    const result = await handlers.analytics(req.body);
    if (result.status === 204) return res.status(204).end();
    return res.status(result.status).json(result.body);
  });
  app.post("/api/admin/login", async (req, res) => {
    const result = await handlers.adminLogin(req.body, req.ip);
    if (result.sessionId) {
      res.setHeader("Set-Cookie", serializeSessionCookie(result.sessionId, {
        secure: process.env.NODE_ENV === "production"
      }));
    }
    return res.status(result.status).json(result.body || {});
  });
  app.post("/api/admin/logout", async (req, res) => {
    const result = await handlers.adminLogout(readSessionCookie(req.headers.cookie));
    res.setHeader("Set-Cookie", serializeSessionCookie("", {
      secure: process.env.NODE_ENV === "production",
      maxAge: 0
    }));
    return res.status(result.status).end();
  });
  app.get("/api/admin/overview", async (req, res) => {
    const result = await handlers.adminOverview(req.query, readSessionCookie(req.headers.cookie));
    return res.status(result.status).json(result.body);
  });
  app.get("/api/admin/health", async (req, res) => {
    const result = await handlers.adminHealth(readSessionCookie(req.headers.cookie));
    return res.status(result.status).json(result.body);
  });

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
  lookupLocations,
  analyticsStore,
  analyticsEnabled = false,
  adminAuth,
  startedAt = new Date().toISOString(),
  logger = console
}) {
  return {
    health: () => ({ status: 200, body: { ok: true, mode: useMock ? "mock" : "qweather", apiHost, ...health } }),
    weather: (query) => safeResult(() => query.full === "true" ? weatherService.getFull(query) : weatherService.getCore(query)),
    details: (query) => safeResult(() => weatherService.getDetails(query)),
    locations: (query) => safeResult(async () => {
      const keyword = String(query.q || "").trim();
      if (!keyword) throw new WeatherInputError("请输入城市、区县或经纬度");
      const coordinates = parseCoordinateQuery(keyword);
      if (useMock) {
        const locations = coordinates
          ? [findNearestMockLocation(coordinates.lon, coordinates.lat)].filter(Boolean)
          : mockLocations.filter((item) => matchesMockLocation(item, keyword)).slice(0, 8);
        return {
          status: 200,
          body: {
            locations,
            refer: { sources: ["Mock"], license: ["MIT"] }
          }
        };
      }
      const data = await lookupLocations(keyword, query);
      return { status: 200, body: { locations: data.location || [], refer: data.refer || null } };
    }),
    analytics: async (body) => {
      if (!analyticsEnabled || !analyticsStore) return { status: 204, body: null };
      const event = normalizeAnalyticsEvent(body);
      if (!event) {
        return {
          status: 400,
          body: { error: { code: "INVALID_ANALYTICS_EVENT", message: "Invalid analytics event" } }
        };
      }
      try {
        await analyticsStore.record(event);
      } catch (error) {
        logger.warn?.("Analytics event was dropped", error?.message);
      }
      return { status: 202, body: { accepted: true } };
    },
    adminLogin: async (body, clientKey) => {
      if (!adminAuth?.enabled) return { status: 404, body: { error: { code: "ADMIN_DISABLED" } } };
      const result = await adminAuth.login(body?.password, clientKey);
      if (result.status !== 200) {
        return {
          status: result.status,
          body: { error: { code: result.status === 429 ? "ADMIN_RATE_LIMITED" : "INVALID_ADMIN_PASSWORD" } }
        };
      }
      return { status: 200, body: { ok: true }, sessionId: result.sessionId };
    },
    adminLogout: async (sessionId) => {
      if (!adminAuth?.enabled) return { status: 404, body: null };
      adminAuth.logout(sessionId);
      return { status: 204, body: null };
    },
    adminOverview: async (query, sessionId) => {
      const denied = adminAccess(adminAuth, sessionId);
      if (denied) return denied;
      const range = Number(query?.range) === 30 ? 30 : 7;
      return {
        status: 200,
        body: analyticsStore?.overview ? await analyticsStore.overview(range) : emptyAnalyticsOverview(range)
      };
    },
    adminHealth: async (sessionId) => {
      const denied = adminAccess(adminAuth, sessionId);
      if (denied) return denied;
      return {
        status: 200,
        body: {
          mode: useMock ? "mock" : "qweather",
          startedAt,
          analytics: analyticsStore?.health?.() || { persistence: "disabled" },
          ...health
        }
      };
    }
  };
}

function parseCoordinateQuery(value) {
  if (!value.includes(",")) return null;
  const parts = value.split(",").map((item) => item.trim());
  if (parts.length !== 2 || parts.some((item) => item === "")) {
    throw new WeatherInputError("经纬度格式无效");
  }
  const [lon, lat] = parts.map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new WeatherInputError("经纬度超出有效范围");
  }
  return { lon, lat };
}

function normalizeAnalyticsEvent(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const type = String(body.type || "");
  const visitorId = String(body.visitorId || "");
  if (!visitorId || visitorId.length > 128) return null;
  const properties = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties)
    ? body.properties
    : {};
  const keys = Object.keys(properties);
  const noProperties = () => keys.length === 0;

  if (["page_view", "city_selected", "reminder_enabled", "reminder_disabled", "notification_sent"].includes(type)) {
    if (!noProperties()) return null;
    return { type, visitorId, properties: {}, at: new Date().toISOString() };
  }
  if (type === "scene_changed") {
    if (keys.length !== 1 || !["commute", "outdoor", "family"].includes(properties.mode)) return null;
    return { type, visitorId, properties: { mode: properties.mode }, at: new Date().toISOString() };
  }
  if (type === "client_error") {
    const allowed = ["weather_core", "weather_details", "notification", "location", "unknown"];
    if (keys.length !== 1 || !allowed.includes(properties.category)) return null;
    return { type, visitorId, properties: { category: properties.category }, at: new Date().toISOString() };
  }
  return null;
}

function adminAccess(adminAuth, sessionId) {
  if (!adminAuth?.enabled) return { status: 404, body: { error: { code: "ADMIN_DISABLED" } } };
  if (!adminAuth.verify(sessionId)) return { status: 401, body: { error: { code: "ADMIN_UNAUTHORIZED" } } };
  return null;
}

function emptyAnalyticsOverview(range) {
  return {
    range,
    days: [],
    totals: {
      pageViews: 0,
      activeVisitors: 0,
      citySelections: 0,
      scenes: { commute: 0, outdoor: 0, family: 0 },
      reminders: { enabled: 0, disabled: 0, sent: 0 },
      errors: {}
    }
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
