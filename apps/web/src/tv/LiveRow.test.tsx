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
  channels: [{ id: 'cn', number: 1, name: 'Cartoon Network', collection, plan: buildChannelPlan({ id: 'cn', number: 1, collection: 'cn' }, collection, [movieTitle('m', 3000)]) }],
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
})
