// Service "util": small helpers every layer of the plugin can use.

/**
 * Reads one value of the settings page (dashboard/settings.json, ctx.config)
 * with a fallback for values nobody saved yet.
 */
export function setting(ctx, key, fallback) {
  const value = ctx.config.get(key);
  return value === undefined || value === null || value === '' ? fallback : value;
}
