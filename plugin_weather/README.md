# Weather

Current weather for any place with `/weather [place]`, from
[OpenWeatherMap](https://openweathermap.org/current) (free plan).

## Setup (admin)

1. Create a free API key at openweathermap.org (new keys need up to 2 hours).
2. Admin → API / Secrets: add the secret `WEATHER_API_KEY` with the key.
3. App Store → Weather → Secrets: switch on `WEATHER_API_KEY` for this plugin.
4. SDK Policies: allow `secrets.read` (and `http.outbound`).

The plugin reads only this one secret, by name. It cannot list other
secrets, and the key is masked in its log.

## Settings (per bot)

Default place, units (°C / °F), language of the description, embed color.

## Block

**Current weather** (`plugin.plugin_weather.current`): place in, results
`{Var}` (description), `.place`, `.emoji`, `.temp`, `.feels_like`,
`.humidity`, `.wind`, `.sunrise`, `.sunset` (Discord timestamps), `.icon`,
`.color`. Port `not_found` when the place is unknown.

Ported from the v2 Weather plugin 3.0.0: the per-bot API key became an admin
secret; sunrise and sunset show in each reader's local time.
