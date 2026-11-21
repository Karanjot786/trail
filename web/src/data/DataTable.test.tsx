import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DataTable, { type TableColumn } from './DataTable'

interface Person {
  id: string
  name: string
  city: string
  visits: number
}

const people: Person[] = Array.from({ length: 60 }, (_, i) => ({
  id: `p${i}`,
  name: `Person ${String(i).padStart(2, '0')}`,
  city: i % 2 ? 'Berlin' : 'Pune',
  visits: (i * 7) % 23,
}))

const columns: TableColumn<Person>[] = [
  { id: 'name', header: 'Name', accessorFn: (r) => r.name, enableHiding: false },
  { id: 'city', header: 'City', accessorFn: (r) => r.city },
  { id: 'visits', header: 'Visits', accessorFn: (r) => r.visits, meta: { align: 'r' } },
]

afterEach(cleanup)

function setup(extra: Partial<Parameters<typeof DataTable<Person>>[0]> = {}) {
  return render(
    <DataTable<Person>
      columns={columns}
      data={people}
      noun="visitors"
      getSearchText={(r) => `${r.name} ${r.city}`}
      emptyState={<p>No visitors yet</p>}
      {...extra}
    />,
  )
}

const heads = () => Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent)
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('DataTable', () => {
  it('sorting toggles aria-sort on the header cell', () => {
    setup()
    const th = screen.getByRole('columnheader', { name: /Visits/ })
    expect(th.getAttribute('aria-sort')).toBeNull()
    fireEvent.click(within(th).getByRole('button'))
    const first = th.getAttribute('aria-sort')
    expect(first === 'ascending' || first === 'descending').toBe(true)
    fireEvent.click(within(th).getByRole('button'))
    const second = th.getAttribute('aria-sort')
    expect(second).not.toBe(first)
    expect(second === 'ascending' || second === 'descending').toBe(true)
    // The first body row carries the extreme value for the current direction.
    const firstVisits = Number(within(bodyRows()[0]).getAllByRole('cell')[2].textContent)
    expect(firstVisits).toBe(second === 'ascending' ? 0 : 22)
  })

  it('applies initialSort', () => {
    setup({ initialSort: { id: 'visits', desc: true } })
    expect(screen.getByRole('columnheader', { name: /Visits/ }).getAttribute('aria-sort')).toBe('descending')
    expect(within(bodyRows()[0]).getAllByRole('cell')[2].textContent).toBe('22')
  })

  it('column menu hides columns and the last visible column cannot be hidden', async () => {
    setup({ columns: columns.map((c) => ({ ...c, enableHiding: undefined })) })
    const open = () => {
      const trigger = screen.getByRole('button', { name: 'Columns' })
      fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    }
    open()
    const menu = await screen.findByRole('menu', { name: 'Columns' })
    const items = within(menu).getAllByRole('menuitemcheckbox')
    expect(items.map((i) => i.textContent)).toEqual(['Name', 'City', 'Visits'])
    expect(items.every((i) => i.getAttribute('aria-checked') === 'true')).toBe(true)

    fireEvent.click(items[1])
    expect(heads()).toEqual(['Name', 'Visits'])
    if (!screen.queryByRole('menu')) open()
    fireEvent.click(within(await screen.findByRole('menu')).getAllByRole('menuitemcheckbox')[2])
    expect(heads()).toEqual(['Name'])

    if (!screen.queryByRole('menu')) open()
    const last = within(await screen.findByRole('menu')).getAllByRole('menuitemcheckbox')[0]
    expect(last.getAttribute('aria-checked')).toBe('true')
    expect(last.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(last)
    expect(heads()).toEqual(['Name'])
  })

  it('Enter on a focusable row calls onRowOpen', () => {
    const onRowOpen = vi.fn()
    setup({ onRowOpen })
    const row = bodyRows()[0]
    expect(row.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onRowOpen).toHaveBeenCalledWith(people[0])
    fireEvent.click(bodyRows()[1])
    expect(onRowOpen).toHaveBeenLastCalledWith(people[1])
  })

  it('rows are not focusable when nothing opens', () => {
    setup()
    expect(bodyRows()[0].getAttribute('tabindex')).toBeNull()
  })

  it('announces page changes as "Page 2 of N"', () => {
    setup()
    expect(bodyRows()).toHaveLength(25)
    const status = screen.getByTestId('dt-announce')
    expect(status.textContent).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(status.textContent).toBe('Page 2 of 3')
    expect(within(bodyRows()[0]).getAllByRole('cell')[0].textContent).toBe('Person 25')
    expect(screen.getByRole('button', { name: 'Previous page' }).hasAttribute('disabled')).toBe(false)
  })

  it('global search filters rows and resets to page 1', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search visitors' }), { target: { value: 'person 1' } })
    const rows = bodyRows()
    expect(rows).toHaveLength(10)
    expect(rows.every((r) => /Person 1\d/.test(r.textContent ?? ''))).toBe(true)
    expect(screen.getByText(/Page 1 of 1/)).toBeTruthy()
  })

  it('filtered to nothing shows the no-match state with Clear search', () => {
    setup()
    const box = screen.getByRole('searchbox', { name: 'Search visitors' })
    fireEvent.change(box, { target: { value: 'xyz' } })
    expect(screen.getByText('No visitors match “xyz”')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(bodyRows()).toHaveLength(25)
    expect((box as HTMLInputElement).value).toBe('')
  })

  it('loading renders 8 skeleton rows', () => {
    const { container } = setup({ loading: true, data: [] })
    expect(container.querySelectorAll('tbody tr[data-skeleton]')).toHaveLength(8)
    expect(screen.getByRole('table').getAttribute('aria-busy')).toBe('true')
  })

  it('error renders ErrorState with retry', () => {
    const onRetry = vi.fn()
    setup({ error: new Error('boom'), onRetry })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('empty data renders the emptyState', () => {
    setup({ data: [] })
    expect(screen.getByText('No visitors yet')).toBeTruthy()
  })

  it('row Filter action filters without opening the row', () => {
    const onRowOpen = vi.fn()
    const onRowFilter = vi.fn()
    setup({
      onRowOpen,
      onRowFilter,
      getRowFilterLabel: (r) => `city ${r.city}`,
      isRowFiltered: (r) => r.id === 'p1',
    })
    const btn = screen.getAllByRole('button', { name: 'Filter by city Pune' })[0]
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(btn)
    fireEvent.keyDown(btn, { key: 'Enter' })
    expect(onRowFilter).toHaveBeenCalledWith(people[0])
    expect(onRowOpen).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove filter city Berlin' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows the total count and an export link', () => {
    setup({ total: 1204, exportHref: '/api/people?format=csv' })
    expect(screen.getByTestId('dt-count').textContent).toBe('1,204 visitors')
    expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe('/api/people?format=csv')
  })

  it('keeps the page in range when data shrinks', () => {
    const { rerender } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    act(() =>
      rerender(
        <DataTable<Person> columns={columns} data={people.slice(0, 10)} noun="visitors" emptyState={<p>none</p>} />,
      ),
    )
    expect(bodyRows()).toHaveLength(10)
  })
})
