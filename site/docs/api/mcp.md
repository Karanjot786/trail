---
title: MCP
description: Let Claude Code, Cursor, VS Code and other assistants read your Trail stats.
---

# MCP

Trail serves a [Model Context Protocol](https://modelcontextprotocol.io) endpoint at `POST /mcp`, over streamable HTTP. Any MCP client can connect with a [read token](/api/tokens) and ask about your sites in plain language: "which pages brought signups this week?", "show me the journey of the last identified visitor".

Every tool but `add_note` only reads. No tool can change goals, sites or settings.

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

| Tool | Returns |
|---|---|
| `list_sites` | Site ids and domains. Call this first |
| `what_changed` | The few biggest changes against the comparison period. A good second call |
| `get_stats` | Visitors, pageviews, sessions, duration, bounce, conversions and revenue, with the previous period and visitors online |
| `get_series` | One metric over time, by hour or day, with the previous period |
| `get_breakdown` | Top values of one dimension (pages, sources, channels, countries, devices, events) |
| `get_live` | Active visitors, countries, sources, pages and the latest events right now |
| `get_heatmap` | Visitors by weekday and hour over the last four weeks |
| `list_visitors` | People with first and last seen, visits, location, device and source |
| `get_sessions` | Sessions with duration, pages, entry and exit, source, goals and revenue |
| `get_journey` | One person's sessions and every step |
| `goal_report` | Conversions, converting visitors and rate per goal, with the previous period |
| `get_goal` | One goal in detail: series, first-touch sources, landing pages and converter paths |
| `list_funnels` | The site's funnel definitions |
| `get_funnel` | People reaching each funnel step, step conversion and the biggest drop |
| `get_funnel_dropoff` | People who reached a step and not the next one |
| `get_campaigns` | UTM campaigns with visitors, sessions, bounce, conversion and revenue |
| `list_events` | Custom and outbound events with counts, people and properties |
| `get_event` | One event in detail: series, property values and the latest occurrences |
| `get_revenue` | Net revenue, purchases, buyers, average order and the latest purchases |
| `get_ai_referrals` | AI assistants that sent visitors |
| `get_ai_visibility` | The AI visibility funnel: crawled, fetched for an answer, visited from AI assistants and converted |
| `get_crawlers` | AI crawler requests by category, provider, crawler and page |
| `get_agents` | AI browsing agents that ran the script, verified or claimed |
| `list_notes` | Chart notes (deploys, campaigns, press) in the range |
| `add_note` | Adds a chart note. Needs a `notes` or `write` token |

Every tool takes `site` (except `list_sites`); most also take `range`, `env` and `filters`. `tools/list` returns each tool's full input schema.

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
