# AMP Game Servers

AMP (CubeCoders) in Discord: log in with a button, list your game servers
with state and players, start, stop and restart them, take backups, change
settings and create new servers from deployment templates.

Version 1.0.0 · developer: BotHub · license: PolyForm-Noncommercial-1.0.0

Needs BotHub with the core update of 2026-10-17 or later (plugins may send
their own login session to an admin address). Update the core first.

## Setup

1. **Admin → API / Secrets** in BotHub: the install creates the secret
   `AMP_URL` empty. Enter the address of the AMP panel, e.g.
   `http://192.168.1.10:8080` (the controller/ADS, or a single instance).
   The home network works, because the admin sets the address.
2. **Bot → Plugins → AMP Game Servers**: choose who may log in and control
   the servers (default: members with *Manage Server*).
3. In Discord: `/amp-login` → **Log in to AMP** → AMP username, password and,
   if used, the 2FA code. Use an AMP user with only the rights the bot needs
   (e.g. a role that may start, stop and back up the instances).
4. Back in **Bot → Plugins → AMP Game Servers**: check the game servers
   Discord may see (none checked: all) and, for `/amp-create`, the
   deployment templates (none checked: creating is off). The lists load after
   the login and every 15 minutes. Save; the `server` option of the commands
   then lists the checked servers.

## Login

The password is only sent to AMP for `Core/Login` and never stored. The
plugin keeps AMP's remember-me token and the session in its storage and
renews an expired session with the token. **Log out** (in `/amp-login`) ends
the session and deletes both. When AMP refuses the token (changed password,
token revoked), log in again.

## Commands

| Command | Who | What |
|---|---|---|
| `/amp-login` | managers | Login panel: connection state, log in, log out |
| `/amp-servers` | everyone | Game servers with state, players and game |
| `/amp-info server` | everyone | State, uptime, CPU, memory, players, address; managers get Start / Stop / Restart / Backup / Refresh buttons |
| `/amp-power server action` | managers | start, stop, restart, kill or update |
| `/amp-backup server [title]` | managers | Backup of the instance (Local File Backup) |
| `/amp-create template [name]` | managers | New game server from a deployment template |
| `/amp-settings server setting [value]` | managers | Lists matching settings; with a value sets one (choices by key or label, true/false, numbers). Password settings are hidden |

The same is available as blocks (category *AMP*) for own commands.

## AMP editions

What works depends on the AMP licence and the rights of the AMP user:

- **Controller (ADS) with instances** (most editions): every command. Start
  of a switched-off instance starts the instance first, then the game server.
- **Single instance** (`AMP_URL` points to one instance): list, info, power,
  backup and settings for that one server; `/amp-create` answers that it
  needs a controller.
- **Deployment templates** exist only in AMP editions that have them; without
  templates `/amp-create` stays off.

AMP itself checks every action: an AMP user without the right gets AMP's
reason as answer.

## Not in Discord

File uploads, mods, the console and scheduled tasks stay in the AMP web
interface.
