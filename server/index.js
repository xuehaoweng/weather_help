import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWeatherApp } from "./app.js";
import { createQWeatherClient } from "./qweather-client.js";
import { createWeatherService } from "./weather-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
loadEnv(path.join(rootDir, ".env"));

const port = Number(process.env.PORT || 8787);
const apiHost = process.env.QWEATHER_API_HOST || "devapi.qweather.com";
const geoHost = process.env.QWEATHER_GEO_HOST || "geoapi.qweather.com";
const apiKey = process.env.QWEATHER_API_KEY;
const useMock = process.env.QWEATHER_MOCK === "true" || !apiKey;
const client = createQWeatherClient({
  apiKey,
  timeoutMs: process.env.QWEATHER_TIMEOUT_MS,
  cachePath: path.join(rootDir, ".cache", "qweather.json")
});
const weatherService = createWeatherService({ client, apiHost, useMock });
const app = createWeatherApp({
  weatherService,
  useMock,
  apiHost,
  health: {
    hasApiKey: Boolean(apiKey),
    hasProjectId: Boolean(process.env.QWEATHER_PROJECT_ID),
    hasCredentialId: Boolean(process.env.QWEATHER_CREDENTIAL_ID)
  },
  lookupLocations: async (query, requestQuery) => {
    const endpoint = geoHost.includes("geoapi.qweather.com") ? "/v2/city/lookup" : "/geo/v2/city/lookup";
    return client.request({
      host: geoHost,
      endpoint,
      params: { location: query, range: String(requestQuery.range || "cn"), number: "8", lang: "zh" },
      ttlMs: 60 * 60 * 1000
    });
  },
  productionDir: process.env.NODE_ENV === "production" ? path.join(rootDir, "dist") : undefined
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Weather API listening on http://0.0.0.0:${port}`);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await new Promise((resolve) => server.close(resolve));
  await client.close();
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    shutdown().then(() => process.exit(0), () => process.exit(1));
  });
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
