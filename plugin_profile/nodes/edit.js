// Node plugin.plugin_profile.edit: opens the edit modal ("about" or
// "favorites") for the member who ran the command, filled with their values.
// Needs a command (a modal answers an interaction). Ports: opened, failed.
import { getProfile, modalFor } from '../services/profile.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function edit(ctx, { config, vars, interaction }) {
  const guildId = String(vars['server.id'] ?? '');
  const userId = String(vars['user.id'] ?? '');
  if (!interaction || !guildId) return { port: 'failed', results: { '.error': 'Editing needs a command on a server.' } };
  const section = String(config.section ?? '') === 'favorites' ? 'favorites' : 'about';
  const profile = await getProfile(ctx, guildId, userId);
  await ctx.interaction.showModal(interaction, modalFor(section, profile, userId));
  return { port: 'opened', results: {} };
}
