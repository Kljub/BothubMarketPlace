// Node plugin.plugin_steamtracker.game (/steam-game): a game of the Steam
// store by name, store link or app ID: price (and sale), players right now,
// reviews, release, developer, genres. With a command it answers itself.
// Results: '' (game name), .appid, .price, .discount, .players, .reviews, .url.
// Ports: replied, next, not_found, failed.
import { details, findApp, money, players, reviews, SteamError, storeUrl } from '../services/steam.js';
import { setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function game(ctx, { config, interaction }) {
  const input = String(config.game ?? '').trim();
  const cc = String(setting(ctx, 'country', 'us'));
  try {
    if (interaction) await ctx.interaction.deferReply(interaction);
    const reply = async (msg) => {
      if (interaction) await ctx.interaction.editReply(interaction, typeof msg === 'string' ? { content: msg } : msg);
    };
    const appid = input ? await findApp(ctx, input, cc) : null;
    const d = appid ? await details(ctx, appid, cc) : null;
    if (!d) {
      await reply(`❌ No Steam game "${input.slice(0, 80)}" found. Use the name, the store link or the app ID.`);
      return { port: interaction ? 'replied' : 'not_found', results: {} };
    }
    const [now, rev] = await Promise.all([players(ctx, d.appid), reviews(ctx, d.appid)]);
    const p = d.price;
    const price = d.free ? 'Free' : p ? (p.discount ? `~~${money(p.initial, p.currency)}~~ **${money(p.final, p.currency)}** (-${p.discount} %)` : `**${money(p.final, p.currency)}**`) : d.comingSoon ? 'Not released yet' : '—';
    if (interaction) {
      await reply({
        embeds: [{
          color: String(setting(ctx, 'color', '#1b2838')), title: d.name, url: storeUrl(d.appid), description: d.short || undefined, image_url: d.image,
          fields: [
            { name: '💲 Price', value: price, inline: true },
            { name: '👥 Playing now', value: now === null ? '—' : now.toLocaleString('en-US'), inline: true },
            { name: '⭐ Reviews', value: rev ?? '—', inline: true },
            { name: '📅 Release', value: d.release || '—', inline: true },
            { name: '🏢 Developer', value: d.developers || '—', inline: true },
            { name: '🏷️ Genres', value: d.genres || '—', inline: true },
          ],
          footer: `App ID ${d.appid} · store ${cc.toUpperCase()}`,
        }],
        components: [[{ type: 'link', url: storeUrl(d.appid), label: 'Steam store' }, { type: 'link', url: `https://steamdb.info/app/${d.appid}/`, label: 'SteamDB', emoji: '📈' }]],
      });
    }
    return {
      port: interaction ? 'replied' : 'next',
      results: { '': d.name, '.appid': String(d.appid), '.price': d.free ? 'Free' : p ? money(p.final, p.currency) : '', '.discount': String(p?.discount ?? 0), '.players': now === null ? '' : String(now), '.reviews': rev ?? '', '.url': storeUrl(d.appid) },
    };
  } catch (err) {
    if (!(err instanceof SteamError)) throw err;
    if (interaction) await ctx.interaction.editReply(interaction, { content: `❌ ${err.message}` });
    return { port: interaction ? 'replied' : 'failed', results: { '.error': err.message } };
  }
}
