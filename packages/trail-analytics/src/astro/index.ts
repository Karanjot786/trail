// trail-analytics/astro (AI agents plan §0.8). P0 placeholder: N-npm implements the integration.

export interface TrailAstroOptions {
  site?: string;
  url?: string;
}

/** The Astro integration: request-time crawler reporting (server output) and script injection. */
export default function trail(_opts?: TrailAstroOptions): { name: string; hooks: Record<string, unknown> } {
  throw new Error('not implemented');
}
