// Service "util": small helpers every layer of the plugin can use.

/**
 * Reads one value of the settings page (dashboard/settings.json, ctx.config,
 * read-only) with a fallback: a value is missing until the bot owner saves
 * the page. Shapes: text/select/color -> string, bool -> boolean,
 * number -> number, channel/role -> { id, guild } or null,
 * channels/roles -> [{ id, guild }], list -> [{ _id, ...item fields }].
 */
export function setting(ctx, key, fallback) {
  const value = ctx.config.get(key);
  return value === undefined || value === null ? fallback : value;
}

/** Replaces {name} placeholders with values; unknown ones stay. */
export function fill(text, values) {
  return String(text).replace(/\{([a-z][a-z0-9_.]*)\}/gi, (all, name) => (name in values ? String(values[name]) : all));
}

/** Reads a JSON value of the storage, or the fallback when missing or broken. */
export async function readJson(ctx, key, fallback) {
  const raw = await ctx.storage.get(key);
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Stores a JSON value (max 16 KB). */
export async function writeJson(ctx, key, value) {
  await ctx.storage.set(key, JSON.stringify(value));
}
