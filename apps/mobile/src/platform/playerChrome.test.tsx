import { renderHook } from '@testing-library/react-native'
import * as NavigationBar from 'expo-navigation-bar'
import * as ScreenOrientation from 'expo-screen-orientation'
import { usePlayerChrome, usePortraitOnPhone } from './playerChrome'

jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(() => Promise.resolve()),
  OrientationLock: { LANDSCAPE: 'LANDSCAPE', PORTRAIT_UP: 'PORTRAIT_UP' },
}))
jest.mock('expo-navigation-bar', () => ({ setVisibilityAsync: jest.fn(() => Promise.resolve()) }))
const lock = ScreenOrientation.lockAsync as jest.Mock
const bar = NavigationBar.setVisibilityAsync as jest.Mock

beforeEach(() => {
  lock.mockClear()
  bar.mockClear()
})

describe('usePlayerChrome', () => {
  it('goes landscape and hides the navigation bar on a phone', async () => {
    await renderHook(() => usePlayerChrome(false))
    expect(lock).toHaveBeenCalledWith('LANDSCAPE')
    expect(bar).toHaveBeenCalledWith('hidden')
  })

  it('restores portrait and the system bars when the player closes', async () => {
    const { unmount } = await renderHook(() => usePlayerChrome(false))
    lock.mockClear()
    bar.mockClear()
    await unmount()
    expect(lock).toHaveBeenCalledWith('PORTRAIT_UP')
    expect(bar).toHaveBeenCalledWith('visible')
  })

  it('does nothing on TV', async () => {
    const { unmount } = await renderHook(() => usePlayerChrome(true))
    await unmount()
    expect(lock).not.toHaveBeenCalled()
    expect(bar).not.toHaveBeenCalled()
  })

  it('never throws when the platform refuses', async () => {
    lock.mockRejectedValueOnce(new Error('unsupported'))
    bar.mockRejectedValueOnce(new Error('unsupported'))
    await expect(renderHook(() => usePlayerChrome(false))).resolves.toBeTruthy()
  })
})

describe('usePortraitOnPhone', () => {
  it('keeps the phone app portrait, and leaves a TV alone', async () => {
    await renderHook(() => usePortraitOnPhone(false))
    expect(lock).toHaveBeenCalledWith('PORTRAIT_UP')
    lock.mockClear()
    await renderHook(() => usePortraitOnPhone(true))
    expect(lock).not.toHaveBeenCalled()
  })
})
