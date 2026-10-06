// Nodes plugin.plugin_steamcalc.calc (/steam-calc) and .profile
// (/steam-profile): the account value and the profile of a Steam player
// (name, profile link or SteamID64). With a command they answer themselves.
// Results: '' (player name), .steamid, .value, .games, .playtime, .level.
// Ports: replied, next, not_found, private, not_set_up, failed.
import { bans, calc, friends, games, hours, level, money, NOT_SET_UP, prices, PRICE_GAMES, resolvePlayer, SteamError, summary } from '../services/steam.js';
import { setting } from '../services/util.js';

const ts = (sec, style) => (sec ? `<t:${sec}:${style}>` : '—');
const flag = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) + ' ' : '');

function banText(b) {
  if (!b.vac && !b.game && !b.community) return '✅ None';
  const parts = [];
  if (b.vac) parts.push(`${b.vac} VAC`);
  if (b.game) parts.push(`${b.game} game`);
  if (b.community) parts.push('community');
  return `⛔ ${parts.join(', ')}${b.days ? ` (last ${b.days} days ago)` : ''}`;
}

/** Shared start: the player, or an answer why not. */
async function player(ctx, config, say, command) {
  const name = String(config.player ?? '').trim();
  if (!name) {
    await say(`❌ Name a Steam player, e.g. /${command} gabelogannewell (custom URL name, profile link or SteamID64).`);
    return null;
  }
  const steamId = await resolvePlayer(ctx, name);
  const p = steamId ? await summary(ctx, steamId) : null;
  if (!steamId || !p) {
    await say(`❌ No Steam player "${name.slice(0, 64)}" found. Use the custom URL name (steamcommunity.com/id/<name>), the profile link or the SteamID64.`);
    return null;
  }
  return { steamId, p };
}

function wrap(fn, command) {
  return async (ctx, { config, interaction }) => {
    const say = async (text) => {
      if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
    };
    try {
      // Many games take a few seconds: answer Discord first.
      if (interaction) await ctx.interaction.deferReply(interaction);
      const replyWith = async (msg) => {
        if (interaction) await ctx.interaction.editReply(interaction, typeof msg === 'string' ? { content: msg } : msg);
      };
      const found = await player(ctx, config, async (t) => replyWith(t), command);
      if (!found) return { port: interaction ? 'replied' : 'not_found', results: {} };
      return await fn(ctx, found, replyWith, interaction);
    } catch (err) {
      if (!(err instanceof SteamError)) throw err;
      if (interaction) await ctx.interaction.editReply(interaction, { content: `❌ ${err.message}` }).catch(() => say(`❌ ${err.message}`));
      return { port: interaction ? 'replied' : err.message === NOT_SET_UP ? 'not_set_up' : 'failed', results: { '.error': err.message } };
    }
  };
}

const color = (ctx) => String(setting(ctx, 'color', '#1b2838'));
const links = (steamId, url) => [[{ type: 'link', url, label: 'Steam profile' }, { type: 'link', url: `https://steamdb.info/calculator/${steamId}/`, label: 'SteamDB calculator', emoji: '🧮' }]];

/** /steam-calc: what the account is worth and how much was played. */
export const calcBlock = wrap(async (ctx, { steamId, p }, reply, interaction) => {
  const list = await games(ctx, steamId);
  if (!list) {
    await reply(`🔒 **${p.name}** keeps the game details private. In Steam: Profile → Edit Profile → Privacy Settings → "Game details" public.`);
    return { port: interaction ? 'replied' : 'private', results: { '': p.name, '.steamid': steamId } };
  }
  const cc = String(setting(ctx, 'country', 'us'));
  const [priceMap, lv, b] = await Promise.all([prices(ctx, list.map((g) => g.appid), cc), level(ctx, steamId), bans(ctx, steamId)]);
  const c = calc(list, priceMap);
  const value = c.value ? money(c.value, c.currency) : '—';
  const fields = [
    { name: '💰 Account value', value: `**${value}**${c.full > c.value ? `\nWithout sales: ${money(c.full, c.currency)}` : ''}\n${c.priced} of ${c.games} games have a price`, inline: true },
    { name: '🎮 Games', value: `**${c.games}** owned\n${c.played} played · ${c.unplayed} never played (${c.games ? Math.round((c.unplayed / c.games) * 100) : 0} %)`, inline: true },
    { name: '⏱️ Playtime', value: `**${hours(c.minutes)}**\nLast 2 weeks: ${hours(c.twoWeeks)}${c.perHour ? `\n${money(c.perHour, c.currency)} per hour` : ''}`, inline: true },
    { name: '⭐ Level', value: `**${lv.level}** · ${lv.badges} badges · ${lv.xp.toLocaleString('en-US')} XP`, inline: true },
    { name: '📅 Member since', value: ts(p.created, 'D'), inline: true },
    { name: '🛡️ Bans', value: banText(b), inline: true },
    { name: '🏆 Most played', value: c.top.length ? c.top.map((g, i) => `${i + 1}. ${g.name} — ${hours(g.minutes)}`).join('\n') : '—' },
  ];
  const note = c.games > PRICE_GAMES ? ` · prices of the ${PRICE_GAMES} most played games` : '';
  await reply({
    embeds: [{ color: color(ctx), title: `🧮 ${p.name} — Steam account`, url: p.url, thumbnail_url: p.avatar || undefined, fields, footer: `Store prices (${cc.toUpperCase()})${note}` }],
    components: links(steamId, p.url),
  });
  return { port: interaction ? 'replied' : 'next', results: { '': p.name, '.steamid': steamId, '.value': value, '.games': String(c.games), '.playtime': hours(c.minutes), '.level': String(lv.level) } };
}, 'steam-calc');

/** /steam-profile: the profile with status, level, friends and recent games. */
export const profileBlock = wrap(async (ctx, { steamId, p }, reply, interaction) => {
  const [lv, b, fr, list] = await Promise.all([level(ctx, steamId), bans(ctx, steamId), friends(ctx, steamId), games(ctx, steamId)]);
  const recent = (list ?? []).filter((g) => g.twoWeeks > 0).sort((a, x) => x.twoWeeks - a.twoWeeks).slice(0, 5);
  const fields = [
    { name: 'Status', value: p.status, inline: true },
    { name: '⭐ Level', value: `**${lv.level}** · ${lv.badges} badges`, inline: true },
    { name: '📅 Member since', value: `${ts(p.created, 'D')} (${ts(p.created, 'R')})`, inline: true },
    { name: '👥 Friends', value: fr === null ? '🔒 private' : fr.toLocaleString('en-US'), inline: true },
    { name: '🎮 Games', value: list ? `${list.length} · ${hours(list.reduce((s, g) => s + g.minutes, 0))}` : '🔒 private', inline: true },
    { name: '🛡️ Bans', value: banText(b), inline: true },
    { name: '🕹️ Last 2 weeks', value: recent.length ? recent.map((g) => `${g.name} — ${hours(g.twoWeeks)}`).join('\n') : '—' },
  ];
  await reply({
    embeds: [{ color: color(ctx), title: `${flag(p.country)}${p.name}`, url: p.url, thumbnail_url: p.avatar || undefined, fields, footer: `SteamID64 ${steamId}${p.public ? '' : ' · profile private'}` }],
    components: links(steamId, p.url),
  });
  return { port: interaction ? 'replied' : 'next', results: { '': p.name, '.steamid': steamId, '.games': list ? String(list.length) : '', '.playtime': list ? hours(list.reduce((s, g) => s + g.minutes, 0)) : '', '.level': String(lv.level), '.value': '' } };
}, 'steam-profile');

export default calcBlock;
