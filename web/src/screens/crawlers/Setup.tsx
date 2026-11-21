// "Other ways" in the Unlock AI crawlers card (plan F-4; first built in Task F4-6): crawler requests from server
// logs. Three ways in: nginx (combined log), Caddy (JSON log), or any proxy posting NDJSON.
import { useState } from 'react'
import { RouteLink } from '../../shell/RouteLink'
import { CodeBlock } from '../../ui/code'
import { Tabs } from '../../ui/tabs'

export function setupCommands(site: string, origin: string) {
  return {
    nginx: `tail -F /var/log/nginx/access.log | trail crawlers import --site ${site} --url ${origin} --token TOKEN -`,
    caddy: `tail -F /var/log/caddy/access.log | trail crawlers import --site ${site} --format caddy --url ${origin} --token TOKEN -`,
    proxy: `curl -X POST ${origin}/api/v1/crawls \\\n  -H "Authorization: Bearer TOKEN" \\\n  -H "Content-Type: application/x-ndjson" \\\n  --data-binary '{"ts":1763600000000,"ua":"GPTBot/1.2","path":"/docs","status":200}'`,
  }
}

type Way = 'nginx' | 'caddy' | 'proxy'

export function Setup({ site, origin }: { site: string; origin: string }) {
  const [way, setWay] = useState<Way>('nginx')
  const cmd = setupCommands(site, origin)
  return (
    <div className="ai-ways">
      <p className="lede">
        No Next.js or Astro? Trail can read crawlers from your server or proxy logs. Only known AI crawler user agents are kept, counted per hour, page and status.
      </p>
      <div className="flex flex-col gap-3">
        <div className="sub-tabs">
          <Tabs
            value={way}
            onValueChange={(v) => setWay(v as Way)}
            ariaLabel="Log source"
            idBase="cr"
            items={[
              { value: 'nginx', label: 'nginx' },
              { value: 'caddy', label: 'Caddy' },
              { value: 'proxy', label: 'Any proxy' },
            ]}
          />
        </div>
        <div role="tabpanel" id={`cr-${way}-panel`} aria-labelledby={`cr-${way}`} className="flex flex-col gap-2">
          <p className="lede">
            {way === 'nginx'
              ? 'Pipe the access log (the default combined format) into the Trail CLI. It keeps running and ships new lines as they arrive.'
              : way === 'caddy'
                ? 'Caddy writes JSON access logs; tell the importer with --format caddy.'
                : 'Anything that can POST: send one JSON line per request to the crawl endpoint. Trail drops user agents that are not AI crawlers.'}
          </p>
          <CodeBlock code={cmd[way]} lang="sh" filename={way === 'proxy' ? 'curl' : 'shell'} />
        </div>
        <p className="method">
          The token needs the <code className="inl">crawl</code> scope and this website.{' '}
          <RouteLink patch={{ screen: 'settings', tab: 'tokens', id: null, sheet: null }}>Create a crawl token</RouteLink>
        </p>
      </div>
    </div>
  )
}
