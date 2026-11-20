import type { PluginOption } from 'vite'
import llmstxt from 'vitepress-plugin-llms'
import { SITE_URL } from './site'

export function llms(): PluginOption[] {
  return [
    llmstxt({
      domain: SITE_URL,
      title: 'Trail',
      description: 'Self-hosted web analytics: a tracker under 2 KB, one Go binary, SQLite, private until the visitor says yes.',
      injectLLMHint: false,
    }),
  ] as PluginOption[]
}
