// Node plugin.plugin_steamcalc.achievements (/steam-achievements): progress
// of a player in a game: unlocked of all, latest, rarest unlocked and the
// easiest still missing. Results: '' (player name), .game, .unlocked,
// .total, .percent. Ports: replied, next, not_found, private, not_set_up, failed.
import { achievementsEmbed, findGame, playerAchievements } from '../services/achievements.js';
import { NOT_SET_UP, resolvePlayer, SteamError, summary } from '../services/steam.js';
import { setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function achievements(ctx, { config, interaction }) {
  const reply = async (msg) => {
    if (interaction) await ctx.interaction.editReply(interaction, typeof msg === 'string' ? { content: msg } : msg);
  };
  try {
    if (interaction) await ctx.interaction.deferReply(interaction);
    const name = String(config.player ?? '').trim();
    const steamId = name ? await resolvePlayer(ctx, name) : null;
    const p = steamId ? await summary(ctx, steamId) : null;
    if (!p) {
      await reply(`❌ No Steam player "${name.slice(0, 64)}" found. Use the custom URL name, the profile link or the SteamID64.`);
      return { port: interaction ? 'replied' : 'not_found', results: {} };
    }
    const appid = await findGame(ctx, config.game);
    if (!appid) {
      await reply(`❌ No Steam game "${String(config.game ?? '').slice(0, 80)}" found. Use the name, the store link or the app ID.`);
      return { port: interaction ? 'replied' : 'not_found', results: { '': p.name } };
    }
    const res = await playerAchievements(ctx, steamId, appid);
    if (!res.list) {
      await reply(res.reason === 'none'
        ? `ℹ️ **${res.game}** has no achievements (or ${p.name} does not own it).`
        : `🔒 **${p.name}** keeps the game details private. In Steam: Profile → Edit Profile → Privacy Settings → "Game details" public.`);
      return { port: interaction ? 'replied' : 'private', results: { '': p.name, '.game': res.game } };
    }
    const done = res.list.filter((a) => a.unlocked).length;
    const percent = res.list.length ? Math.round((done / res.list.length) * 100) : 0;
    await reply({ embeds: [achievementsEmbed({ ...p, steamId }, res.game, appid, res.list, String(setting(ctx, 'color', '#1b2838')))] });
    return { port: interaction ? 'replied' : 'next', results: { '': p.name, '.game': res.game, '.unlocked': String(done), '.total': String(res.list.length), '.percent': String(percent) } };
  } catch (err) {
    if (!(err instanceof SteamError)) throw err;
    await reply(`❌ ${err.message}`);
    return { port: interaction ? 'replied' : err.message === NOT_SET_UP ? 'not_set_up' : 'failed', results: { '.error': err.message } };
  }
}
