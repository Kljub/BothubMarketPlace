# Work

A job system. The bot owner lists jobs on the plugin page (name, key, emoji,
description, pay range, cooldown, active). Members:

- `/job-list`: all active jobs
- `/job-accept job`: take one (key or name)
- `/work`: a shift pays a random amount of the job's range to the Economy
  module; then the cooldown runs
- `/job-leave`: quit

Settings: the jobs, currency name.

SDK permissions: `modules.economy.balance.read`, `modules.economy.balance.write`,
`storage`, `discord.interactions.reply`.

Ported from the v2 Work plugin (jobs moved from the own table to the
settings page, one Economy balance instead of several currencies).
