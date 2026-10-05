import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock } from '#sdk-testing';
import plugin from '../index.js';
import { maxTimes, mine, parseInputs, rollDrops } from '../services/blocks.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const permissions = ['storage', 'discord.interactions.reply', 'modules.economy.balance.read', 'modules.economy.balance.write'];
const vars = { 'server.id': GUILD, 'user.id': ANN };
const ctxWith = (config = {}) => createTestContext({ id: 'plugin_lootcraft', permissions, config, balances: {} });

test('drops are weighted, recipes parsed', () => {
  const table = [{ item: 'a', weight: 1, min: 1, max: 1 }, { item: 'b', weight: 3, min: 2, max: 2 }];
  assert.deepEqual(rollDrops(table, 2, () => 0.1), { a: 2 });
  assert.deepEqual(rollDrops(table, 1, () => 0.9), { b: 2 });
  assert.deepEqual(parseInputs('Copper_Ore:2, coal , :3'), [{ item: 'copper_ore', count: 2 }, { item: 'coal', count: 1 }]);
  assert.equal(maxTimes({ copper_ore: 5, coal: 1 }, { inputs: [{ item: 'copper_ore', count: 2 }, { item: 'coal', count: 1 }] }), 1);
});

test('mine with cooldown, smelt, craft, sell', async () => {
  const ctx = ctxWith({ drops: [{ item: 'iron_ore', weight: 1, min: 4, max: 4 }, { item: 'coal', weight: 1, min: 2, max: 2 }], mine_rolls: 2 });
  let i = 0;
  const seq = [0.1, 0, 0.9, 0];
  assert.equal((await mine(ctx, { vars }, () => seq[i++ % 4])).results[''], 'iron_ore:4,coal:2');
  assert.equal((await runBlock(plugin, 'mine', ctx, { vars })).port, 'failed', 'cooldown');
  assert.equal((await runBlock(plugin, 'smelt', ctx, { vars, config: { item: 'iron bar', amount: 'all' } })).results[''], '2');
  assert.equal((await runBlock(plugin, 'smelt', ctx, { vars, config: { item: 'iron_bar', amount: '1' } })).port, 'failed', 'ore used up');
  assert.equal((await runBlock(plugin, 'craft', ctx, { vars, config: { item: 'iron_sword' } })).port, 'failed', 'needs 3 bars and stone');
  assert.equal((await runBlock(plugin, 'sell', ctx, { vars, config: { item: 'iron_bar', amount: '1' } })).results[''], '30');
  assert.equal((await runBlock(plugin, 'sell', ctx, { vars, config: { item: 'all' } })).results[''], '30');
  assert.equal(await ctx.economy.get(GUILD, ANN), 60);
  const inv = await runBlock(plugin, 'inventory', ctx, { vars, interaction: 'c' });
  assert.equal(inv.results[''], '0');
});

test('recipes list', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'recipes', ctx, { vars, interaction: 'c' });
  assert.equal(out.results[''], '6');
  assert.match(ctx.answers.at(-1).message.embeds[0].description, /Iron bar ← 2× ⚪ Iron ore \+ 1× ⚫ Coal/);
});
