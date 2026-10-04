# AI Chat

Chat with an AI from Discord.

- `/ask question [web]`: answers in the channel (the bot shows "thinking"
  and edits the answer in when it arrives, up to 60 seconds).
- `/ask-reset`: the AI forgets your conversation.
- With "Answer mentions" the bot answers when someone mentions it, or
  replies to one of its AI answers (optionally only in chosen channels).

Providers: OpenAI, Anthropic (Claude), Groq, NVIDIA, Ollama (own server) or
any OpenAI-compatible server. Set it up under **Settings → API / Secrets**:
`AI_API_KEY` (the key) and, for Ollama or "OpenAI-compatible", `AI_URL`
(the server address, e.g. `http://192.168.1.10:11434`). Switch off the
secrets you do not need on the App Store page. Optional `BRAVE_API_KEY`
for web search through Brave (else DuckDuckGo instant answers).

Settings: provider, model, system prompt plus "behave like this" and "never
do this", max. tokens, creativity, memory length and timeout, web search,
answers to mentions and their channels.

SDK permissions: `secrets.use` (the bot adds the key; the plugin never sees
it), `storage` (memory), `discord.interactions.reply`,
`discord.events.messages`, `discord.messages.send`.

Ported from the v2 AI Chat plugin. Not ported: the bot/user presence and the
day's moderation numbers in the prompt (no SDK access to presences).
