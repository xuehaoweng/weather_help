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
ANALYTICS_ENABLED=false
ANALYTICS_HASH_SECRET=
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
```

For public demos, use a restricted QWeather key or keep `QWEATHER_MOCK=true`.

## Optional Analytics and Admin

Set all three values to enable the local aggregate store and `/admin`:

```bash
ANALYTICS_ENABLED=true
ANALYTICS_HASH_SECRET=generate-a-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=use-a-strong-independent-password
```

- The analytics file is stored at `.cache/analytics.json`.
- Only 30 days of daily aggregates are retained.
- The current implementation is intended for one Express instance.
- Admin sessions are kept in process memory and expire after 30 minutes of inactivity.
- A service restart signs all administrators out.
- Production cookies use `Secure`, so production traffic must use HTTPS.

If `ADMIN_PASSWORD` is empty, admin data endpoints are hidden. `ADMIN_USERNAME` defaults to `admin` when a password is configured. If analytics is disabled or the hash secret is empty, the dashboard remains available with zero aggregate metrics when administrator credentials are configured.

Back up `.cache/analytics.json` only if aggregate history matters. Never publish `.env` or copy its secrets into an image.
