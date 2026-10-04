// The blocks behind /rps and /rps-duel.
import { betOf, choiceOf, DUEL_MS, duelMessage, EMOJI, LABEL, money, newDuel, randomChoice, resolve, take } from './game.js';

async function fail(ctx, interaction, text) {
  if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  return { port: 'failed', results: { '': text } };
}

/** /rps: against the bot. A win pays twice the bet, a tie pays it back. */
export async function solo(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  const user = vars['user.id'];
  if (!guild || !user) return fail(ctx, interaction, '❌ Only on a server.');
  const mine = choiceOf(config.choice);
  if (!mine) return fail(ctx, interaction, '❌ Choose rock, paper or scissors.');
  const { bet, error } = betOf(ctx, config.bet);
  if (error) return fail(ctx, interaction, error);
  const short = await take(ctx, guild, user, bet);
  if (short) return fail(ctx, interaction, short);
  const bots = randomChoice(ctx);
  const outcome = resolve(mine, bots);
  let line = outcome === 'tie' ? '🤝 Tie!' : outcome === 'a' ? '🎉 You win!' : '💀 You lose!';
  if (bet) {
    if (outcome === 'tie') line += `\nBet back. Balance: ${money(ctx, await ctx.economy.add(guild, user, bet))}`;
    else if (outcome === 'a') line += `\nWon ${money(ctx, bet * 2)}. Balance: ${money(ctx, await ctx.economy.add(guild, user, bet * 2))}`;
    else line += `\nBet lost. Balance: ${money(ctx, await ctx.economy.get(guild, user))}`;
  }
  const result = outcome === 'a' ? 'win' : outcome === 'b' ? 'lose' : 'tie';
  const message = {
    embeds: [{ color: outcome === 'a' ? '#22c55e' : outcome === 'tie' ? '#eab308' : '#ef4444', title: '✂️ Rock, Paper, Scissors',
      description: `You: ${EMOJI[mine]} ${LABEL[mine]}\nBot: ${EMOJI[bots]} ${LABEL[bots]}\n\n${line}` }],
  };
  if (interaction) {
    await ctx.interaction.reply(interaction, message);
    return { port: 'replied', results: { '': result, '.bot': bots } };
  }
  return { port: 'next', results: { '': result, '.bot': bots } };
}

/** /rps-duel: challenges a member; the bet of the challenger is taken now. */
export async function duel(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  const user = vars['user.id'];
  const opponent = String(config.opponent ?? '').replace(/\D/g, '');
  if (!guild || !user || !interaction) return fail(ctx, interaction, '❌ Only as a command on a server.');
  if (!opponent) return fail(ctx, interaction, '❌ Choose an opponent.');
  if (opponent === user) return fail(ctx, interaction, '❌ You cannot duel yourself.');
  const target = await ctx.member.get(guild, opponent).catch(() => null);
  if (!target || target.bot) return fail(ctx, interaction, '❌ Choose a member (no bot).');
  const { bet, error } = betOf(ctx, config.bet);
  if (error) return fail(ctx, interaction, error);
  const short = await take(ctx, guild, user, bet);
  if (short) return fail(ctx, interaction, short);
  const d = { id: ctx.utils.uuid().replace(/-/g, '').slice(0, 12), challenger: user, opponent, bet, betText: bet ? money(ctx, bet) : '', guild, accepted: false, picks: {}, at: Date.now() };
  await newDuel(ctx, d);
  await ctx.interaction.reply(interaction, duelMessage(d, `<@${user}> challenges <@${opponent}>!`));
  return { port: 'replied', results: { '': d.id } };
}

export { DUEL_MS };
