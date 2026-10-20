import { fireEvent, render, screen } from '@testing-library/react-native'
import { programLabel } from '@go10/core/tv/describe'
import { resolveLineup } from '@go10/core/tv/lineup'
import { scheduleAt } from '@go10/core/tv/schedule'
import { collectionOf, showTitle } from '@go10/core/tv/testing'
import type { ScheduleChannel } from '@go10/core/tv/types'
import { ChannelTile } from './ChannelTile'

const lineup = resolveLineup(
  { epoch: '2026-10-01T00:00:00Z', defaultChannel: 'cn', channels: [{ id: 'cn', number: 7, collection: 'cn' }] },
  [collectionOf('cn', ['coraje'])],
  [showTitle('coraje', 4, 600)],
)!
const channel = lineup.channels[0] as ScheduleChannel
const schedule = scheduleAt(channel.plan, lineup.epochMs, lineup.epochMs + 90_000, 1)
const BASE = 'https://tv.test/'

describe('ChannelTile', () => {
  it('shows the number and the program, and is labelled for screen readers', async () => {
    await render(<ChannelTile channel={channel} schedule={schedule} imageBase={BASE} onSelect={jest.fn()} />)
    const label = programLabel(schedule.current.unit)
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByLabelText(`7 CN: ${label}`)).toBeTruthy()
  })

  it('selects its channel', async () => {
    const onSelect = jest.fn()
    await render(<ChannelTile channel={channel} schedule={schedule} imageBase={BASE} onSelect={onSelect} />)
    await fireEvent.press(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith(channel)
  })

  it('marks the playing channel', async () => {
    await render(<ChannelTile channel={channel} schedule={schedule} imageBase={BASE} current onSelect={jest.fn()} />)
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ selected: true })
  })
})

describe('ChannelTile for a YouTube live', () => {
  const live = resolveLineup(
    { epoch: '2026-10-01T00:00:00Z', defaultChannel: 'aj', channels: [{ id: 'aj', number: 301, name: 'Al Jazeera', youtube: 'gCNeDWCI0vo' }] },
    [],
    [],
  )!.channels[0]

  it('shows "En vivo" and the live thumbnail, with no progress', async () => {
    await render(<ChannelTile channel={live} imageBase={BASE} onSelect={jest.fn()} />)
    expect(screen.getByLabelText('301 Al Jazeera: En vivo')).toBeTruthy()
    expect(screen.getByText('En vivo')).toBeTruthy()
    expect(screen.getByTestId('chtile-thumb').props.source).toEqual([{ uri: 'https://i.ytimg.com/vi/gCNeDWCI0vo/hqdefault_live.jpg' }])
    expect(screen.queryByTestId('chtile-progress')).toBeNull()
  })
})
