---
title: Agent signature probe
description: A small test server in the Trail repository that shows whether an AI agent signs the requests a page sends, and whether those signatures verify.
---

# Agent signature probe

Some AI agents sign their requests with Web Bot Auth. Trail marks an agent as Verified when a signature checks out (see [Verified and claimed](/dashboard/ai-visibility#verified-and-claimed)). What matters is which requests an agent signs: the page it opens, or also the beacons that page's script sends. The probe answers that for a real agent in a few minutes.

It is a test tool for a source checkout, not part of the Trail binary. It lives in `scripts/agentprobe/`.

## What it does

`scripts/agentprobe/run.sh` builds the probe and starts two origins on your machine, each behind its own Cloudflare quick tunnel:

| Origin | Local address | Serves |
|---|---|---|
| A | `127.0.0.1:8331` | The probe page, plus `/same` and `/_t/e` |
| B | `127.0.0.1:8332` | A cross-origin target for beacons |

When the agent opens the page on origin A, the page sends four requests the way Trail's script does, then repeats them 5 seconds later:

1. a same-origin `fetch` with `keepalive` and a text body, to `/same`;
2. a cross-origin `fetch` to origin B;
3. a `sendBeacon` to origin B;
4. a same-origin `fetch` to `/_t/e`, which origin A passes on to origin B, as a rewrite would.

For every request, including the page load itself, the probe writes one line to `.probe/log.ndjson`. It records whether the request carried `Signature` and `Signature-Input`, the `Signature-Agent` value, and whether the signature verifies against the live key directories of `https://chatgpt.com` and `https://agent.bot.goog`. It never logs signature bytes or client IPs.

## Before you start

- A clone of the Trail repository and Go, to build the probe.
- `cloudflared` on your `PATH`, for the two quick tunnels. They need no Cloudflare account.
- Outbound HTTPS to `chatgpt.com` and `agent.bot.goog`, to fetch the signature keys.
- An AI agent you can send to a URL.

## Run it

From the repository root:

```sh
scripts/agentprobe/run.sh
```

After a few seconds it prints:

```txt
Probe page (send the agent here): https://<name>.trycloudflare.com
Log: .probe/log.ndjson   (Ctrl-C to stop)
```

Ask the agent to open that URL and stay on the page for 15 seconds. The page lists each request as it goes and ends with "Done. Thank you." Press Ctrl-C to stop the probe and both tunnels.

To run the probe without tunnels, for example behind your own HTTPS host, start it directly:

```sh
go run ./scripts/agentprobe -b-url https://<public URL of origin B>
```

Flags: `-a` and `-b` set the listen addresses, `-log` the log file (appended), and `-verify=false` skips signature checks.

## Read the result

The terminal shows one line per request, and the log holds the same as JSON:

```txt
A GET /        sig=true agent="https://chatgpt.com" verified="chatgpt-agent"
A POST /same    sig=false agent="" verified=""
```

| Field | Meaning |
|---|---|
| `origin`, `method`, `path` | Which origin and request. `GET /` on origin A is the page load |
| `kind`, `round` | Which of the four requests (`same`, `cross`, `beacon`, `rewrite`) and which round |
| `ua`, `bodyUA`, `webdriver` | The user agent in the header, the one the page saw, and `navigator.webdriver` |
| `hasSig`, `hasSigInput`, `sigAgent` | Whether the signature headers were there, and the signing origin |
| `verified` | The agent id when the signature verifies, such as `chatgpt-agent` |
| `verifyErr` | Why a signature did not verify |

How to read it:

- **The beacons verify** (`same` or `rewrite` rows have a `verified` agent). Trail can verify the agent on the script's own requests, with no server hook.
- **Only the page load verifies.** The agent signs page requests only. Trail can verify it only through a server hook that passes the page's signature on, which is what [`npx trail-analytics init`](/add/ai-crawlers) sets up. Without one, Trail recognises the agent by user agent at best.
- **Nothing is signed.** Trail falls back to the agent's published IP list or its user agent.
- **`verifyErr` on a signed request.** The signature was present but did not check out, for example an expired signature or a key Trail does not have yet. A key that is still loading is retried once after 3 seconds.

## Next

- See how agents appear in [AI visibility](/dashboard/ai-visibility).
- Control the key and list downloads with [`TRAIL_AGENT_LISTS`](/operations/configuration#ai-agent-lists).
