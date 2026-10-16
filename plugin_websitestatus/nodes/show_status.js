// Node plugin.plugin_websitestatus.show_status: the status of one website or
// service (/sitestatus name), or of all of them (no name), from the last
// check round. Answers the command ephemeral; ports "replied", "next",
// "not_found".
import { entries, findEntry, line, STATUS, TEXT } from '../services/monitor.js';
import { recentReports } from '../services/reports.js';
import { fill, readJson, setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function showStatus(ctx, { config, interaction }) {
  const lang = setting(ctx, 'language', 'en');
  const t = TEXT[lang] ?? TEXT.en;
  const name = String(config.site ?? '').trim();
  let embed;
  if (!name) {
    const all = entries(ctx);
    if (!all.length) embed = { description: `❌ ${t.none}`, color: STATUS.red.color };
    else {
      const results = await Promise.all(all.map(async (e) => {
        const r = await readJson(ctx, `status:${e._id}`, null);
        return { entry: e, r: r && { ...r, site: e } };
      }));
      const worst = results.some((x) => x.r?.status === 'red') ? 'red' : results.some((x) => x.r?.status === 'yellow') ? 'yellow' : 'green';
      embed = { title: `📡 ${t.overview}`, description: results.map((x) => line(t, x.r, x.entry.name)).join('\n').slice(0, 4096), color: STATUS[worst].color, timestamp: true };
    }
  } else {
    const entry = findEntry(ctx, name);
    if (!entry) {
      const text = `❌ ${fill(t.unknown, { name: name.slice(0, 64) })}`;
      if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
      return { port: 'not_found', results: { '': text } };
    }
    const r = await readJson(ctx, `status:${entry._id}`, null);
    const reports = (await recentReports(ctx, entry._id)).length;
    const fields = [];
    if (r?.detail) fields.push({ name: t.detail, value: String(r.detail).slice(0, 1024) });
    if (!entry.service && r?.latencyMs != null) fields.push({ name: t.latency, value: `${r.latencyMs} ms`, inline: true });
    if (!entry.service && r?.code != null) fields.push({ name: 'HTTP', value: String(r.code), inline: true });
    fields.push({ name: t.user_reports, value: String(reports), inline: true });
    if (r) fields.push({ name: t.checked_at, value: `<t:${Math.floor(r.at / 1000)}:R>`, inline: true });
    if (entry.link) fields.push({ name: t.page, value: entry.link });
    const state = r ? `${STATUS[r.status].emoji} **${t[STATUS[r.status].key]}**` : `⚪ ${t.unchecked}`;
    embed = { title: entry.name, url: entry.url, description: state, fields, color: STATUS[r?.status ?? 'yellow'].color, timestamp: true };
  }
  if (interaction) await ctx.interaction.reply(interaction, { embeds: [embed] }, { ephemeral: true });
  return { port: interaction ? 'replied' : 'next', results: { '': embed.description ?? '' } };
}
