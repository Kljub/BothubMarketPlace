// Service "api" ("http.endpoints"). The plugin has no network access of
// its own. It calls a global API endpoint by name:
//   ctx.http.endpoint(KEY, { method?, path?, query?, json?, headers? })
//     -> { status, headers, json (null if not JSON), text }
// The admin creates the endpoint (base URL + secret) under Admin -> API /
// Secrets and shares it with this plugin; the bot adds the auth header, so
// the API key never enters the plugin. Rules: KEY must be in bothub.json
// "services.endpoints"; path starts with "/", no ".." or "//"; no
// Authorization, Cookie or Host headers; request JSON <= 64 KB, answer
// <= 1 MB, 10 s timeout. Errors: sdk.http.not_shared, sdk.http.bad_path,
// sdk.http.timeout, sdk.http.too_big.

export const ENDPOINT = '__ENDPOINT__';

/** GET <endpoint><path>?<query>; returns the SDK answer. */
export function get(ctx, path, query = {}) {
  return ctx.http.endpoint(ENDPOINT, { method: 'GET', path, query });
}

/** Reads "a.b.0.c" out of a JSON value; undefined when missing. */
export function pick(value, path) {
  if (!path) return value;
  let cur = value;
  for (const part of String(path).split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Turns "a=1&b=two" into { a: '1', b: 'two' }. */
export function parseQuery(text) {
  return Object.fromEntries(new URLSearchParams(String(text ?? '')));
}
