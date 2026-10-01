# API Lookup

Fetches values from an API endpoint the admin set up.

Version 1.0.0 · developer: BotHub · license: MIT

## Structure

```
Plugin
  ├── Commands    commands/   hello.json
  ├── Events      events/     -
  ├── Services    services/   API EXAMPLE_API
  ├── Nodes       nodes/      hello, api_get
  └── Dashboard   dashboard/  -
        │
        ▼
   BotHub SDK  →  Core  →  Discord · DB · Redis
```

## SDK permissions the admin must enable

- `http.endpoints`

## API endpoints

Create under Admin → API / Secrets and share with the plugin (Admin → Plugins):

- `EXAMPLE_API`

## Built from

- **Node (builder block)**: A block for the command and event builder: nodes/hello.json describes it, nodes/hello.js runs it (config + variables in, results out).
- **Slash command**: A slash command as a builder graph (commands/hello.json) that uses the node "hello". Every bot gets it as a disabled copy in Custom Commands; the owner switches it on and can edit it.
- **External API service**: Calls an external API through a global API endpoint (services/api.js, Admin -> API / Secrets). The bot adds the API key; the plugin never sees it. The admin shares the endpoint with the plugin.

## Develop

```
npm test                        # tests of all plugins
npm run validate -- api-lookup
npm run pack -- api-lookup         # dist/api-lookup-<version>.zip + SHA-256
```

Raise `version` in `bothub.json` for every release.
