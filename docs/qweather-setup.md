# QWeather Setup

1. Open https://dev.qweather.com/
2. Create or select a project.
3. Create credentials for server-side API use.
4. Copy your project ID, credential ID, and API key into `.env`.

```bash
QWEATHER_MOCK=false
QWEATHER_PROJECT_ID=your_project_id
QWEATHER_CREDENTIAL_ID=your_credential_id
QWEATHER_API_KEY=your_api_key
QWEATHER_API_HOST=devapi.qweather.com
QWEATHER_GEO_HOST=geoapi.qweather.com
```

## Host Notes

The app supports the public development hosts:

- `devapi.qweather.com`
- `geoapi.qweather.com`

If you use a QWeather dedicated API host, set both host variables to the host values from your QWeather console. Dedicated hosts use the newer endpoint layout for GeoAPI; the server handles the public GeoAPI host separately.

## Security

- Do not commit `.env`.
- Do not call QWeather directly from frontend code with your API key.
- Set domain/IP restrictions in the QWeather console when available.
- Consider JWT authentication before production use.
