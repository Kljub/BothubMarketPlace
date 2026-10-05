// Node plugin.plugin_dbdstats.stats: Dead by Daylight statistics of a Steam
// player (name, profile link or SteamID64). With a command it answers itself
// with an embed and a link to the full breakdown on deadbystats.eu.
// Results: '' (player name), .steamid, .bloodpoints, .escapes, .kills,
// .playtime. Ports: replied, next, not_found, private, not_set_up, failed.
import { dbdStats, NOT_SET_UP, playerSummary, playtime, resolvePlayer, StatsError, statsEmbed, summarize } from '../services/steam.js';
import { setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function stats(ctx, { config, interaction }) {
  const say = async (text) => {
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  };
  const name = String(config.player ?? '').trim();
  if (!name) {
    await say('❌ Name a Steam player, e.g. /dbd-stats ezteabag (custom URL name, profile link or SteamID64).');
    return { port: interaction ? 'replied' : 'not_found', results: {} };
  }
  try {
    const steamId = await resolvePlayer(ctx, name);
    const player = steamId ? await playerSummary(ctx, steamId) : null;
    if (!steamId || !player) {
      await say(`❌ No Steam player "${name.slice(0, 64)}" found. Use the custom URL name (steamcommunity.com/id/<name>), the profile link or the SteamID64.`);
      return { port: interaction ? 'replied' : 'not_found', results: {} };
    }
    const data = await dbdStats(ctx, steamId);
    if (!data) {
      await say(`🔒 **${player.name}** has no public Dead by Daylight statistics. In Steam: Profile → Edit Profile → Privacy Settings → "My profile" and "Game details" public.`);
      return { port: interaction ? 'replied' : 'private', results: { '': player.name, '.steamid': steamId } };
    }
    const time = await playtime(ctx, steamId);
    const sum = summarize(data, time);
    if (interaction) {
      await ctx.interaction.reply(interaction, {
        embeds: [statsEmbed(player, sum, String(setting(ctx, 'color', '#b91c1c')))],
        components: [[{ type: 'link', url: `https://deadbystats.eu/profile/${steamId}`, label: 'Full stats', emoji: '📊' }, { type: 'link', url: player.url, label: 'Steam profile' }]],
      });
    }
    return {
      port: interaction ? 'replied' : 'next',
      results: { '': player.name, '.steamid': steamId, '.bloodpoints': sum.bloodpoints, '.escapes': sum.escapes, '.kills': sum.kills, '.playtime': sum.playtime },
    };
  } catch (err) {
    if (!(err instanceof StatsError)) throw err;
    await say(`❌ ${err.message}`);
    return { port: interaction ? 'replied' : err.message === NOT_SET_UP ? 'not_set_up' : 'failed', results: { '.error': err.message } };
  }
}
