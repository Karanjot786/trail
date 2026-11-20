---
title: MCP
description: Let Claude Code, Cursor, VS Code and other assistants read your Trail stats.
---

# MCP

Trail serves a [Model Context Protocol](https://modelcontextprotocol.io) endpoint at `POST /mcp`, over streamable HTTP. Any MCP client can connect with a [read token](/api/tokens) and ask about your sites in plain language: "which pages brought signups this week?", "show me the journey of the last identified visitor".

The seven tools only read. They cannot change goals, sites or settings.

## Connect a client

Replace the host and token with yours.

::: code-group

```sh [Claude Code]
claude mcp add --transport http trail https://stats.example.com/mcp \
  --header "Authorization: Bearer <read-token>"
```

```json [Cursor]
{
  "mcpServers": {
    "trail": {
      "url": "https://stats.example.com/mcp",
      "headers": { "Authorization": "Bearer <read-token>" }
    }
  }
}
```

```json [VS Code]
{
  "servers": {
    "trail": {
      "type": "http",
      "url": "https://stats.example.com/mcp",
      "headers": { "Authorization": "Bearer <read-token>" }
    }
  }
}
```

:::

Cursor reads this from `~/.cursor/mcp.json`, and VS Code from `.vscode/mcp.json`.

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `list_sites` | none | Site ids and domains. Call this first |
| `get_stats` | `site`, `range?`, `env?`, `filters?` | Visitors, pageviews, bounce rate, the previous period, and visitors online |
| `get_series` | `site`, `metric`, `range?` | `visitors`, `pageviews` or `bounce` over time |
| `get_breakdown` | `site`, `dim`, `range?`, `limit?` | Top values of one dimension |
| `list_visitors` | `site`, `range?`, `q?`, `limit?` | People with first and last seen, visits, country, device and source |
| `get_journey` | `site`, `person` | One person's sessions and every step |
| `goal_report` | `site`, `range?` | Conversions and rate per goal, with the previous period |

`range` is `24h`, `7d`, `30d`, `90d` or `12mo` (default `7d`), or `{"from": ms, "to": ms}`. `env` defaults to `production`. `dim` and `filters` use the same dimensions as the [read API](/api/read-api#common-parameters).

Results come back both as JSON text in `content` and as `structuredContent`. Bad arguments return a tool error with `isError: true` and a message the assistant can act on.

## Try it with curl

```sh
curl -s https://stats.example.com/mcp \
  -H "Authorization: Bearer <read-token>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_stats","arguments":{"site":"mysite","range":"24h"}}}'
```

```json
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"visitors\":1,...}"}],"structuredContent":{"visitors":1,"pageviews":1,"bounce":1,"prev":{"visitors":0,"pageviews":0,"bounce":0},"online":1}}}
```

The endpoint is stateless: each `POST` carries one JSON-RPC message (`initialize`, `tools/list`, `tools/call`) and gets one JSON reply. Requests count against the token's 300-per-minute limit.

## Next

- Mint a read token: [Keys and tokens](/api/tokens).
- Need raw HTTP? See the [Read API](/api/read-api).
