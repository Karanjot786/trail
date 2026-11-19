// Vite empties dist on build; restore the .keep that web/embed.go's go:embed relies on.
import { writeFileSync } from 'node:fs'
writeFileSync(new URL('../dist/.keep', import.meta.url), '')
