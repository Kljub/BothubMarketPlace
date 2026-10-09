// Service "storage": ctx.storage ("storage" permission), strings per bot
// and plugin, kept in the BotHub database by the core. Values max. 16 KB.

/** Reads a JSON value, or the fallback when missing or broken. */
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
