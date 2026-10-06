// Service "blocks": the blocks of Trading Cards (nodes/<name>.js re-export them):
//   open        (/cards open)        draws a pack: free once per cooldown, else coins
//   collection  (/cards collection)  the cards of a member by rarity, completion
//   show        (/cards show)        one card with its picture
//   trade       (/cards trade)       offers a card for a card; the other member accepts or declines
//   gift        (/cards gift)        gives one card to a member
// With a command each answers itself. Ports: replied, next, failed.
import { cardMessage, cards, CardError, change, collection, collectionText, drawPack, findCard, keyOf, newTrade, payForPack, peekTrade, RARITY, takeTrade } from './cards.js';
import { setting } from './util.js';

const user = (vars, config, key = 'user') => {
  const raw = String(config[key] ?? '').replace(/[<@!>]/g, '').trim();
  return /^\d{15,21}$/.test(raw) ? raw : String(vars['user.id'] ?? '');
};

function block(fn) {
  return async (ctx, input) => {
    const { interaction } = input;
    try {
      return await fn(ctx, input);
    } catch (err) {
      if (!(err instanceof CardError)) throw err;
      if (interaction) await ctx.interaction.reply(interaction, `❌ ${err.message}`, { ephemeral: true });
      return { port: interaction ? 'replied' : 'failed', results: { '.error': err.message } };
    }
  };
}

export const open = block(async (ctx, { vars, interaction }) => {
  const g = String(vars['server.id'] ?? '');
  const u = String(vars['user.id'] ?? '');
  if (!g) throw new CardError('Packs are opened on a server.');
  const list = cards(ctx);
  if (!list.length) throw new CardError('No cards yet: an admin adds them on the dashboard.');
  const paid = await payForPack(ctx, g, u);
  const size = Math.max(1, Math.min(10, Number(setting(ctx, 'pack_size', 3)) || 3));
  const drawn = drawPack(list, size);
  const before = await collection(ctx, g, u);
  for (const c of drawn) await change(ctx, g, u, c.key, 1);
  const best = [...drawn].sort((a, b) => Object.keys(RARITY).indexOf(b.rarity) - Object.keys(RARITY).indexOf(a.rarity))[0];
  const lines = drawn.map((c) => `${RARITY[c.rarity].emoji} **${c.name}** · ${RARITY[c.rarity].name}${before[c.key] ? '' : ' 🆕'}`);
  const { message, file } = cardMessage(ctx, best);
  message.embeds[0].title = `🎴 Pack opened${paid.paid === 'free' ? '' : ` (−${paid.paid} coins)`}`;
  message.embeds[0].description = `<@${u}> got:\n${lines.join('\n')}\n\nBest card: **${best.name}**`;
  if (interaction) await ctx.interaction.reply(interaction, message, file ? { file } : undefined);
  return { port: interaction ? 'replied' : 'next', results: { '': drawn.map((c) => c.name).join(', '), '.best': best.name, '.rarity': best.rarity } };
});

export const collectionBlock = block(async (ctx, { vars, config, interaction }) => {
  const g = String(vars['server.id'] ?? '');
  const u = user(vars, config);
  const list = cards(ctx);
  const c = collectionText(list, await collection(ctx, g, u));
  if (interaction) {
    await ctx.interaction.reply(interaction, {
      embeds: [{ color: String(setting(ctx, 'color', '#f59e0b')), title: `🎴 Collection — ${c.unique}/${c.of} cards (${c.percent} %)`, description: `<@${u}> · ${c.total} cards in total\n\n${c.text}`.slice(0, 4000) }],
    });
  }
  return { port: interaction ? 'replied' : 'next', results: { '': c.text, '.unique': String(c.unique), '.total': String(c.total), '.percent': String(c.percent) } };
});

export const show = block(async (ctx, { vars, config, interaction }) => {
  const list = cards(ctx);
  const card = findCard(list, config.card);
  if (!card) throw new CardError(`No card "${String(config.card ?? '').slice(0, 60)}".`);
  const g = String(vars['server.id'] ?? '');
  const owned = g ? (await collection(ctx, g, String(vars['user.id'] ?? '')))[card.key] ?? 0 : 0;
  const { message, file } = cardMessage(ctx, card, owned ? `You own **${owned}**.` : 'You do not own it yet.');
  if (interaction) await ctx.interaction.reply(interaction, message, file ? { file } : undefined);
  return { port: interaction ? 'replied' : 'next', results: { '': card.name, '.rarity': card.rarity, '.owned': String(owned) } };
});

export const trade = block(async (ctx, { vars, config, interaction }) => {
  const g = String(vars['server.id'] ?? '');
  const from = String(vars['user.id'] ?? '');
  const to = user(vars, config, 'target');
  if (!g || !to || to === from) throw new CardError('Pick another member to trade with.');
  const list = cards(ctx);
  const give = findCard(list, config.give);
  const want = findCard(list, config.want);
  if (!give || !want) throw new CardError(`No card "${String((give ? config.want : config.give) ?? '').slice(0, 60)}".`);
  if (!((await collection(ctx, g, from))[give.key] > 0)) throw new CardError(`You do not own **${give.name}**.`);
  if (!((await collection(ctx, g, to))[want.key] > 0)) throw new CardError(`<@${to}> does not own **${want.name}**.`);
  const id = await newTrade(ctx, { g, from, to, give: give.key, want: want.key });
  if (interaction) {
    await ctx.interaction.reply(interaction, {
      content: `<@${to}>`,
      embeds: [{ color: '#3b82f6', title: '🔁 Trade offer', description: `<@${from}> offers ${RARITY[give.rarity].emoji} **${give.name}** for your ${RARITY[want.rarity].emoji} **${want.name}**.\nValid <t:${Math.floor((Date.now() + 15 * 60_000) / 1000)}:R>.` }],
      components: [[{ key: 'trade_yes', data: id, label: 'Accept', style: 'success' }, { key: 'trade_no', data: id, label: 'Decline', style: 'danger' }]],
    });
  }
  return { port: interaction ? 'replied' : 'next', results: { '': id } };
});

export const gift = block(async (ctx, { vars, config, interaction }) => {
  const g = String(vars['server.id'] ?? '');
  const from = String(vars['user.id'] ?? '');
  const to = user(vars, config, 'target');
  if (!g || !to || to === from) throw new CardError('Pick another member.');
  const card = findCard(cards(ctx), config.card);
  if (!card) throw new CardError(`No card "${String(config.card ?? '').slice(0, 60)}".`);
  if (!(await change(ctx, g, from, card.key, -1))) throw new CardError(`You do not own **${card.name}**.`);
  await change(ctx, g, to, card.key, 1);
  if (interaction) await ctx.interaction.reply(interaction, `🎁 <@${from}> gave <@${to}> ${RARITY[card.rarity].emoji} **${card.name}**.`);
  return { port: interaction ? 'replied' : 'next', results: { '': card.name } };
});

/** Buttons of a trade offer: only the asked member; both cards are checked again. */
export async function tradeYes(ctx, ev) {
  const t = await peekTrade(ctx, ev.data);
  if (t && ev.user.id !== t.to) return ctx.interaction.reply(ev.handle, 'Only the asked member can answer this offer.', { ephemeral: true });
  const offer = await takeTrade(ctx, ev.data);
  if (!offer) return ctx.interaction.update(ev.handle, { content: '⌛ This offer has expired.', embeds: [], components: [] });
  const [a, b] = await Promise.all([collection(ctx, offer.g, offer.from), collection(ctx, offer.g, offer.to)]);
  if (!(a[offer.give] > 0) || !(b[offer.want] > 0)) return ctx.interaction.update(ev.handle, { content: '❌ One of the cards is no longer there.', embeds: [], components: [] });
  await change(ctx, offer.g, offer.from, offer.give, -1);
  await change(ctx, offer.g, offer.to, offer.give, 1);
  await change(ctx, offer.g, offer.to, offer.want, -1);
  await change(ctx, offer.g, offer.from, offer.want, 1);
  const list = cards(ctx);
  const name = (k) => list.find((c) => c.key === k)?.name ?? k;
  await ctx.interaction.update(ev.handle, { content: `✅ Traded: <@${offer.from}> got **${name(offer.want)}**, <@${offer.to}> got **${name(offer.give)}**.`, embeds: [], components: [] });
}

export async function tradeNo(ctx, ev) {
  const t = await peekTrade(ctx, ev.data);
  if (t && ev.user.id !== t.to && ev.user.id !== t.from) return ctx.interaction.reply(ev.handle, 'This is not your trade.', { ephemeral: true });
  await takeTrade(ctx, ev.data);
  await ctx.interaction.update(ev.handle, { content: `❌ Trade declined by <@${ev.user.id}>.`, embeds: [], components: [] });
}

export { keyOf };
