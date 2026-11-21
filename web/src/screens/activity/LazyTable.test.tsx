import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import LazyTable from './LazyTable'

afterEach(cleanup)

it('loads DataTable lazily behind a skeleton fallback', async () => {
  const { container } = render(
    <LazyTable<{ n: string }>
      columns={[{ id: 'n', header: 'Name', accessorFn: (r) => r.n }]}
      data={[{ n: 'Ada' }]}
      noun="people"
      emptyState={<p>none</p>}
    />,
  )
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  // The lazy chunk's first import transforms @tanstack/react-table: slow on a loaded machine, so the wait is
  // generous; what matters is the skeleton first, then the table.
  expect(await screen.findByRole('table', {}, { timeout: 25_000 })).toBeTruthy()
  expect(screen.getByText('Ada')).toBeTruthy()
}, 30_000)
