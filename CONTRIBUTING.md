# Contributing

Thanks for considering a contribution.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

The default configuration uses Mock data. Use real QWeather data only in your local `.env`.

## Pull Request Checklist

- Keep API keys and secrets out of commits.
- Run `npm run build`.
- Keep UI text readable on mobile.
- Prefer small, focused changes.
- Update README or docs when behavior changes.

## Issues

Good issues include:

- What you expected
- What happened
- Browser and OS
- Whether `QWEATHER_MOCK=true` or real QWeather data was used
- Console/API errors when available
