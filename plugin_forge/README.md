# Stable Diffusion Forge

AI images from your own [Stable Diffusion WebUI Forge](https://github.com/lllyasviel/stable-diffusion-webui-forge)
server in Discord, like the ArcEnCiel plugin.

| Command | What it does |
|---|---|
| `/forge-imagine prompt [neg_prompt] [steps] [cfg] [width] [height] [seed]` | Text to image |
| `/forge-img2img image prompt [strength] [neg_prompt] [steps] [seed]` | A new image from your image |

The image comes into the channel with a second embed: prompt, negative
prompt, seed, size, steps, CFG, sampler and model. Buttons under it:

- **🔍 Upscale**: the same image (same seed) again with hires fix, 1.5× or 2×
  (upscaler and strength in the settings). For img2img: the same image bigger.
- **🔄 Regenerate**: the same request with a new seed.

Forge works on one image at a time: the plugin queues the requests, the
answer shows the place in the queue and then the progress in %.

## Setup

1. Start Forge with `--api` (and `--listen` when the bot runs on another
   machine), e.g. `webui.bat --api --listen`.
2. Settings → API / Secrets: `FORGE_URL` = the address of Forge, e.g.
   `http://192.168.1.20:7860` (also in the home network). With `--api-auth
   user:password`, put `user:password` into `FORGE_AUTH`; without it, switch
   `FORGE_AUTH` off.
3. Plugin settings: checkpoint, sampler, scheduler and upscaler are
   dropdowns filled from your Forge server (every 30 minutes and when the
   plugin starts); size, steps, CFG, negative prompt, NSFW, hourly limit.

NSFW: only when allowed and only in age-restricted channels (as spoilers).
Elsewhere the plugin adds NSFW terms to the negative prompt; that is no
safety filter, so use an SFW model where it matters.

SDK permissions: `secrets.use`, `storage`, `storage.files`, `scheduler`,
`discord.interactions.reply`, `discord.messages.files`, `discord.channels.read`.
The images never pass through the plugin: the bot sends the source image
and stores the answer image itself (`http.secret` with `jsonFile` and
`fileFrom`); the address and login stay in the bot.
