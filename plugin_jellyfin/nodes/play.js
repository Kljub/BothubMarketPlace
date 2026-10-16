// Node plugin.plugin_jellyfin.play: plays music from Jellyfin in the voice channel of
// the member (the bot's music queue: /skip, /queue, /volume … work). Search
// term plus kind (any, track, album, artist, playlist). Results: '' (what was
// added), .count, .position. Ports: replied, next, not_found, no_voice,
// failed.
import { errorText } from '../services/jellyfin.js';
import { findMusic, hitLabel, songsOf } from '../services/music.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function play(ctx, { config, vars, interaction }) {
  const say = async (text, ephemeral = true) => {
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral });
  };
  const guildId = String(vars['server.id'] ?? '');
  const userId = String(vars['user.id'] ?? '');
  const query = String(config.query ?? '').trim();
  const kind = ['track', 'album', 'artist', 'playlist'].includes(String(config.kind)) ? String(config.kind) : 'any';
  if (!guildId || !query) {
    await say('❌ Name a song, album, artist or playlist.');
    return { port: interaction ? 'replied' : 'not_found', results: {} };
  }
  const found = await findMusic(ctx, query, kind);
  if (!found.ok) {
    await say(`❌ ${errorText(found)}`);
    return { port: interaction ? 'replied' : 'failed', results: { '.error': errorText(found) } };
  }
  const hit = found.hits.find((h) => h.title.toLowerCase() === query.toLowerCase()) ?? found.hits[0];
  const songs = hit ? await songsOf(ctx, hit) : [];
  if (!hit || !songs.length) {
    await say(`❌ Nothing to play for "${query.slice(0, 100)}" in the shared Jellyfin music libraries.`);
    return { port: interaction ? 'replied' : 'not_found', results: {} };
  }
  let added;
  try {
    added = await ctx.music.enqueue(guildId, songs, { joinUser: userId, textChannelId: String(vars['channel.id'] ?? '') || undefined, requester: userId });
  } catch (err) {
    const key = String(err?.message ?? err);
    const text = key.includes('no_voice') ? 'Join a voice channel first.' : key.includes('unavailable') ? 'The Music module is not running on this bot.' : `The music could not be played (${key.slice(0, 120)}).`;
    await say(`❌ ${text}`);
    return { port: interaction ? 'replied' : key.includes('no_voice') ? 'no_voice' : 'failed', results: { '.error': text } };
  }
  const what = hitLabel(hit);
  await say(`▶️ ${what}${songs.length > 1 ? ` (${added.added} songs)` : ''} · position ${added.position} in the queue`, false);
  return { port: interaction ? 'replied' : 'next', results: { '': what.replace(/\*\*/g, ''), '.count': String(added.added), '.position': String(added.position) } };
}
