// Event guildMemberAdd: a linked member joins a server of the settings and
// gets the roles and nickname at once; others get the unverified role.
import { applyGuild, linkOf } from '../services/verify.js';

export default async function guildMemberAdd(ctx, p) {
  const user = String(p['user.id'] ?? '');
  const guild = String(p['server.id'] ?? '');
  if (!/^\d{17,20}$/.test(user) || !guild || p['user.bot'] === true) return;
  await applyGuild(ctx, guild, user, await linkOf(ctx, user)).catch(() => undefined);
}
