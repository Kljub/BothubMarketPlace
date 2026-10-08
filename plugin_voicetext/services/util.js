// Service "util": settings and placeholders.

/**
 * One value of the settings page with a fallback (missing until the page is
 * saved). channel -> { id, guild } or null, channels -> [{ id, guild }],
 * list -> [{ _id, ...fields }].
 */
export function setting(ctx, key, fallback) {
  const value = ctx.config.get(key);
  return value === undefined || value === null ? fallback : value;
}

/** Replaces {name} placeholders with values; unknown ones stay. */
export function fill(text, values) {
  return String(text).replace(/\{([a-z][a-z0-9_.]*)\}/gi, (all, name) => (name in values ? String(values[name]) : all));
}

/** A Discord channel name: lower case, dashes, at most 90 characters. */
export function channelName(text) {
  const n = String(text).toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
  return n || 'voice-text';
}
