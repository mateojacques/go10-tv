import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import { TvProvider } from './TvProvider'
import { LiveRow } from './LiveRow'
import { buildChannelPlan } from '@go10/core/tv/plan'
import { collectionOf, movieTitle } from '@go10/core/tv/testing'
import type { Lineup } from '@go10/core/tv/types'

const EPOCH = Date.UTC(2026, 9, 1)
const collection = collectionOf('cn', ['m'])
const lineup: Lineup = {
  epochMs: EPOCH, defaultChannel: 'cn',
  channels: [{ id: 'cn', number: 1, name: 'Cartoon Network', collection, group: 'network', plan: buildChannelPlan({ id: 'cn', number: 1, collection: 'cn' }, collection, [movieTitle('m', 3000)]) }],
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(EPOCH + 1000)
})
afterEach(() => vi.useRealTimers())

describe('LiveRow', () => {
  it('lists the live channels under "En vivo ahora" and tunes one in', () => {
    const onWatch = vi.fn()
    render(
      <TvProvider lineup={lineup}>
        <FocusProvider onBack={() => {}}>
          <LiveRow rowIndex={1} onWatch={onWatch} />
        </FocusProvider>
      </TvProvider>,
    )
    expect(screen.getByRole('heading', { name: /En vivo ahora/ })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '1 Cartoon Network: m' }))
    expect(onWatch).toHaveBeenCalledWith('cn')
  })

  const franchise = collectionOf('dbz', ['m'])
  const mixedLineup: Lineup = {
    ...lineup,
    channels: [
      ...lineup.channels,
      { id: 'dbz', number: 101, name: 'Dragon Ball', collection: franchise, group: 'franchise', plan: buildChannelPlan({ id: 'dbz', number: 101, collection: 'dbz' }, franchise, [movieTitle('m', 3000)]) },
    ],
  }
  const renderLiveRow = (l: Lineup) =>
    render(
      <TvProvider lineup={l}>
        <FocusProvider onBack={() => {}}>
          <LiveRow rowIndex={1} onWatch={() => {}} />
        </FocusProvider>
      </TvProvider>,
    )

  it('shows networks under "Canales" and franchises under "24/7"', () => {
    renderLiveRow(mixedLineup)
    const canales = screen.getByText('Canales')
    const franquicias = screen.getByText('24/7')
    expect(canales.compareDocumentPosition(franquicias) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label')?.split(' ')[0])).toEqual(['1', '101'])
  })

  it('shows no "24/7" label when there are no franchise channels', () => {
    renderLiveRow(lineup)
    expect(screen.queryByText('24/7')).toBeNull()
  })
})
