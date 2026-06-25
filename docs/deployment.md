# Deployment

## Production Build

```bash
npm install
npm run build
NODE_ENV=production npm run start
```

The Express server serves `dist/` in production and keeps `/api/*` on the same origin.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

Open:

```text
http://localhost:8787/
```

## Environment Variables

```bash
QWEATHER_MOCK=false
QWEATHER_PROJECT_ID=
QWEATHER_CREDENTIAL_ID=
QWEATHER_API_KEY=
QWEATHER_API_HOST=devapi.qweather.com
QWEATHER_GEO_HOST=geoapi.qweather.com
PORT=8787
```

For public demos, use a restricted QWeather key or keep `QWEATHER_MOCK=true`.
