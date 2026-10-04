// Block behind /minesweeper: takes the bet and posts the board.
import { betOf, money, take } from './econ.js';
import { board, clampMines, GRID, layMines, multiplierAt } from './game.js';
import { readJson, setting, writeJson } from './util.js';

export function embed(ctx, r, outcome = null, extra = '') {
  const rtp = Number(setting(ctx, 'rtp', 97));
  const mult = multiplierAt(r.mineCount, r.revealed.length, rtp);
  const lines = [
    `💣 Mines: **${r.mineCount}**/${GRID} · 💎 Safe: **${r.revealed.length}**/${GRID - r.mineCount}`,
    `Bet: ${money(ctx, r.bet)} · Multiplier: **${mult.toFixed(2)}x** (≈ ${money(ctx, r.bet * mult)})`,
  ];
  lines.push('', outcome ? extra : 'Click a field. 🔥 pays your multiplier once you found at least one diamond.');
  const titles = { boom: '💥 Mine!', cashout: '💰 Cashed out!', cleared: '🏆 Field cleared!', expired: '⌛ Round ended' };
  return { color: outcome === 'boom' ? '#ef4444' : outcome ? '#4ade80' : '#f0c040', title: outcome ? titles[outcome] : '💣 Minesweeper', description: lines.join('\n') };
}

export async function play(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  const user = vars['user.id'];
  const no = async (text) => {
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: 'failed', results: { '': text } };
  };
  if (!guild || !user || !interaction) return no('❌ Only as a command on a server.');
  const open = await ctx.storage.get(`open:${guild}:${user}`);
  if (open && (await ctx.storage.has(`ms:${open}`))) return no('❌ Finish your running round first.');
  const { bet, error } = betOf(ctx, config.bet);
  if (error) return no(error);
  const mines = clampMines(config.mines);
  const short = await take(ctx, guild, user, bet);
  if (short) return no(short);
  const r = { id: ctx.utils.uuid().replace(/-/g, '').slice(0, 12), guild, user, bet, mineCount: mines, mines: layMines(ctx, mines), revealed: [], at: Date.now() };
  await writeJson(ctx, `ms:${r.id}`, r);
  await ctx.storage.set(`open:${guild}:${user}`, r.id);
  await writeJson(ctx, 'rounds', [...(await readJson(ctx, 'rounds', [])), r.id]);
  await ctx.interaction.reply(interaction, { embeds: [embed(ctx, r)], components: board(r) });
  return { port: 'replied', results: { '': r.id } };
}
