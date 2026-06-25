# Weather Pro

An open-source weather decision assistant powered by QWeather. It combines realtime weather, minute-level precipitation, warnings, lifestyle indices, and commute/outdoor/family suggestions into a focused interface for before-you-go decisions.

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Mock mode is enabled by default, so the app works without a QWeather account.

Open:

```text
http://localhost:5177/
```

## Use Real QWeather Data

Create a QWeather project and credential at https://dev.qweather.com/, then update `.env`:

```bash
QWEATHER_MOCK=false
QWEATHER_PROJECT_ID=your_project_id
QWEATHER_CREDENTIAL_ID=your_credential_id
QWEATHER_API_KEY=your_api_key
QWEATHER_API_HOST=devapi.qweather.com
QWEATHER_GEO_HOST=geoapi.qweather.com
PORT=8787
```

Never commit `.env` or expose your API key in frontend code.

## License

MIT
