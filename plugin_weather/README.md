# Weather

Current weather for any place with `/weather [place]`, from
[OpenWeatherMap](https://openweathermap.org/current) (free plan).

## Setup (admin)

1. Create a free API key at openweathermap.org (new keys need up to 2 hours).
2. Install the plugin. BotHub creates the secret `WEATHER_API_KEY` empty
   (`[NULL]`) under Admin → API / Secrets, shared with this plugin; the App
   Store shows "Not set up" until it has a value.
3. Admin → API / Secrets → `WEATHER_API_KEY` → "Enter value": paste the key.

SDK permission: only `secrets.use`. The bot adds the key to the request to
api.openweathermap.org; the plugin never sees it and cannot read or list
other secrets.

## Settings (per bot)

Default place, units (°C / °F), language of the description, embed color.

## Block

**Current weather** (`plugin.plugin_weather.current`): place in, results
`{Var}` (description), `.place`, `.emoji`, `.temp`, `.feels_like`,
`.humidity`, `.wind`, `.sunrise`, `.sunset` (Discord timestamps), `.icon`,
`.color`. Port `not_found` when the place is unknown.

Ported from the v2 Weather plugin 3.0.0: the per-bot API key became an admin
secret; sunrise and sunset show in each reader's local time.

## Changes

- 1.1.0: requests through `ctx.http.secret` (`secrets.use`) instead of
  reading the key (`secrets.read` + `http.outbound`); the install creates the
  empty secret, a clear "not set up" message until it has a value.
- 1.0.0: port of the v2 Weather plugin 3.0.0.
