// Block "start" (/potatopirates): opens a table in the channel. With bots
// (1-5) the game starts at once against the computer; without, a lobby opens
// where members join and the host adds bots.
import { settle } from './auto.js';
import { GameError, addPlayer, createGame, startGame } from './engine.js';
import { env, errorText, gameConfig, lang, listGames, loadGame, saveGame } from './flow.js';
import { writeJson } from './storage.js';
import { handPanel, tableMessage } from './view.js';
import { t } from './i18n.js';

const LEVELS = ['easy', 'medium', 'hard'];

async function no(ctx, interaction, text) {
  if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  return { port: 'failed', results: { '': text } };
}

export async function start(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const guild = vars['server.id'];
  const channel = vars['channel.id'];
  const user = vars['user.id'];
  if (!guild || !channel || !user) return no(ctx, interaction, `❌ ${t(L, 'err.server')}`);
  const bots = Math.floor(Number(String(config.bots ?? '').trim() || 0));
  if (!(bots >= 0 && bots <= 5)) return no(ctx, interaction, `❌ ${t(L, 'err.bots')}`);
  const level = LEVELS.includes(String(config.difficulty)) ? String(config.difficulty) : 'medium';

  const running = await ctx.storage.get(`c:${channel}`);
  if (running && (await loadGame(ctx, running))) return no(ctx, interaction, `❌ ${t(L, 'err.channel_game')}`);

  const id = ctx.utils.uuid().replace(/-/g, '').slice(0, 10);
  const g = createGame({ id, guild, channel, host: user, lang: L, cfg: gameConfig(ctx) });
  const e = env();
  try {
    addPlayer(g, { id: user, name: String(vars['user.name'] || 'Pirate').slice(0, 32) });
    for (let k = 0; k < bots; k++) addPlayer(g, { id: '', name: 'Bot', bot: level });
    if (bots) {
      startGame(g, e);
      settle(g, e);
    }
  } catch (err) {
    if (!(err instanceof GameError)) throw err;
    return no(ctx, interaction, errorText(g, ctx, err));
  }
  g.at = e.now;
  g.msg = await ctx.message.send(channel, tableMessage(g));
  await saveGame(ctx, g);
  await ctx.storage.set(`c:${channel}`, id);
  await writeJson(ctx, 'games', [...(await listGames(ctx)), id]);
  if (interaction) {
    if (bots) await ctx.interaction.reply(interaction, handPanel(g, 0), { ephemeral: true });
    else await ctx.interaction.reply(interaction, t(L, 'ok.started'), { ephemeral: true });
  }
  return { port: 'replied', results: { '': id } };
}
