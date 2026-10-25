// Node plugin.plugin_wichteln.start: posts the round with its buttons (/wichteln).
import { eventMessage, newEvent, t } from '../services/wichteln.js';

const plain = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function start(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  const host = vars['user.id'];
  if (!guild || !host || !interaction) {
    const text = t(ctx, 'only_server');
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: 'failed', results: { '': text } };
  }
  const e = {
    id: ctx.utils.uuid().replace(/-/g, '').slice(0, 12),
    guild, host,
    title: plain(config.title, 100), budget: plain(config.budget, 100), date: plain(config.date, 100),
    // The host is in from the start.
    members: [host], names: { [host]: plain(vars['user.nickname'] || vars.user || vars['user.name'] || host, 64) }, wishes: {},
    drawn: false, cancelled: false, pairs: {}, pending: [], failed: [], at: Date.now(),
  };
  await newEvent(ctx, e);
  await ctx.interaction.reply(interaction, eventMessage(ctx, e));
  return { port: 'replied', results: { '': e.id } };
}
