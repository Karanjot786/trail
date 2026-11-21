// Vitest setup: findBy* and waitFor wait up to 5 s (1 s by default), so screen tests hold up on a loaded machine.
import { configure } from '@testing-library/react'

configure({ asyncUtilTimeout: 5000 })
