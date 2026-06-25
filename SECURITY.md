# Security

## API Keys

QWeather credentials must stay server-side. Do not commit `.env`, do not put API keys in frontend code, and do not expose them through public API responses.

The app returns only boolean credential status from `/api/health`.

## Reporting

Please open a private security advisory or contact the maintainer before publishing details of a vulnerability.
