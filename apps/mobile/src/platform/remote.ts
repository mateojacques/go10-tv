import { useEffect, useRef, useState } from 'react'
import { BackHandler, useTVEventHandler } from 'react-native'
import { createRemoteKeyFilter, type RemoteKey } from '@go10/core/player/playerKeys'

/** Remote key presses (see createRemoteKeyFilter). The latest `onKey` is always used. */
export function useRemoteKeys(onKey: (key: RemoteKey) => void): void {
  const handler = useRef(onKey)
  handler.current = onKey
  const [filter] = useState(createRemoteKeyFilter)
  useTVEventHandler((event) => {
    const key = filter(event)
    if (key) handler.current(key)
  })
}

/** Hardware, gesture and remote Back; `onBack` returns true to consume it. */
export function useBackPress(onBack: () => boolean): void {
  const handler = useRef(onBack)
  handler.current = onBack
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => handler.current())
    return () => subscription.remove()
  }, [])
}
