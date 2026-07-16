# Security

## API Keys

QWeather credentials must stay server-side. Do not commit `.env`, do not put API keys in frontend code, and do not expose them through public API responses.

The app returns only boolean credential status from `/api/health`.

## Administrator Dashboard

- Keep `ADMIN_PASSWORD` and `ANALYTICS_HASH_SECRET` out of source control.
- Use different, randomly generated values for the administrator password and hash secret.
- Serve production deployments over HTTPS so the admin session cookie is marked `Secure`.
- The dashboard uses an in-memory session with a 30-minute idle timeout and login rate limiting.
- Anonymous analytics does not persist IP addresses, search terms, precise coordinates, User-Agent strings, or raw installation identifiers.
- Remove `.cache/analytics.json` if you need to erase all retained aggregate analytics.

## Reporting

Please open a private security advisory or contact the maintainer before publishing details of a vulnerability.
