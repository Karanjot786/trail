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
  expect(await screen.findByRole('table', {}, { timeout: 5000 })).toBeTruthy()
  expect(screen.getByText('Ada')).toBeTruthy()
})
