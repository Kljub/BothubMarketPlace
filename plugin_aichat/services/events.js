// Mentions: with "mention_enabled" the bot answers when someone mentions it
// (in the chosen channels, all when none are chosen) or replies to one of
// its AI answers (their IDs: storage "answers").
import { ask, clip } from './ai.js';
import { readJson, setting, writeJson } from './util.js';

export const events = {
  async messageCreate(ctx, m) {
    if (!setting(ctx, 'mention_enabled', false) || m['user.bot'] === true || !m['channel.id']) return;
    const channels = setting(ctx, 'mention_channels', []).map((c) => c.id);
    if (channels.length && !channels.includes(m['channel.id'])) return;
    const answers = await readJson(ctx, 'answers', []);
    const replyToMine = m['message.reply_to'] && answers.includes(m['message.reply_to']);
    if (m['message.mentions_bot'] !== true && !replyToMine) return;
    const question = String(m['message.content'] ?? '').replace(/<@!?\d+>/g, '').trim();
    if (!question) return;
    let text;
    try {
      text = `🤖 <@${m['user.id']}> ${clip(await ask(ctx, m['user.id'], question))}`;
    } catch (err) {
      text = `❌ ${err.message}`;
    }
    const id = await ctx.message.send(m['channel.id'], text);
    await writeJson(ctx, 'answers', [...answers, id].slice(-200));
  },
};
