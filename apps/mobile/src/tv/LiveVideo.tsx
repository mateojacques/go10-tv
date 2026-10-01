import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AppState, Platform, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { LOAD_TIMEOUT_MS } from '@go10/core/player/playbackSession'
import { backoffMs, initialPlayerRetryState, playerRetryReducer } from '@go10/core/player/playerRetry'
import { okru } from '@go10/core/player/providers/okru'
import { clockLabel, programLabel } from '@go10/core/tv/describe'
import { createLiveSession } from '@go10/core/tv/liveSession'
import { scheduleAt } from '@go10/core/tv/schedule'
import type { Channel } from '@go10/core/tv/types'
import { commandScript, hostHtml, OKRU_CHROME_PX, parseHostMessage } from '../player/hostPage'
import { allowNavigation } from '../player/navigationGuard'
import { theme } from '../theme'

const tv = Platform.isTV

/**
 * Loaded, but the position hasn't moved for this long: something in the
 * embed waits for a tap (an ok.ru ad), so the screen lets taps through.
 */
export const STALL_MS = 4000

/**
 * One channel's embed, kept on the live schedule (apps/web/src/tv/TvSlot.tsx
 * on the player's WebView host page). Every load and retry rejoins the live
 * second; a dead channel retunes at the next program boundary.
 */
export function LiveVideo({
  channel,
  epochMs,
  siteUrl,
  soundOn,
  onFailedChange,
  onStalledChange,
}: {
  channel: Channel
  epochMs: number
  siteUrl: string
  soundOn: boolean
  /** True while the channel has given up ("Señal interrumpida"), false once it retunes. */
  onFailedChange?: (failed: boolean) => void
  /** True while loaded but not moving (an ad waiting for a tap), false once it moves. */
  onStalledChange?: (stalled: boolean) => void
}) {
  const [state, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const webRef = useRef<WebView>(null)
  const loaded = useRef(false)
  const [session] = useState(() =>
    createLiveSession({
      plan: channel.plan,
      epochMs,
      send: (command) => webRef.current?.injectJavaScript(commandScript(command)),
      onFinishedEarly: rerender,
    }),
  )
  const send = (command: unknown) => webRef.current?.injectJavaScript(commandScript(command))

  // Every load and every retry rejoins the live second.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const src = useMemo(() => session.tune(), [state.reloadToken])
  const airing = session.current()
  const gaveUp = state.status === 'failed'

  // ok.ru autoplays muted (spike 2026-10-01): sound is always asked for.
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn
  const applySound = () => {
    if (soundRef.current) {
      send(okru.unmuteMessage)
      send(okru.volumeMessage?.(1))
    } else {
      send(okru.muteMessage)
    }
  }
  useEffect(() => {
    if (loaded.current) applySound()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn])

  const onFailedRef = useRef(onFailedChange)
  onFailedRef.current = onFailedChange
  useEffect(() => {
    onFailedRef.current?.(gaveUp)
  }, [gaveUp])

  // The on-demand player's retry loop: timeout → backoff → remount.
  useEffect(() => {
    if (state.status === 'loading') {
      const timer = setTimeout(() => {
        if (!loaded.current) dispatch({ type: 'timeout' })
      }, LOAD_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    if (state.status === 'retrying') {
      const timer = setTimeout(() => {
        loaded.current = false
        dispatch({ type: 'retryLoadStarted' })
      }, backoffMs(state.attempt))
      return () => clearTimeout(timer)
    }
  }, [state.status, state.attempt, state.reloadToken])

  const reload = () => {
    loaded.current = false
    dispatch({ type: 'reset' })
  }

  // The program boundary; a dead channel retunes from scratch there.
  const endsAt = airing?.endsAt ?? 0
  useEffect(() => {
    if (!endsAt) return
    const timer = setTimeout(() => {
      if (gaveUp || session.sync(endsAt) === 'load') reload()
      else rerender()
    }, Math.max(0, endsAt - Date.now()))
    return () => clearTimeout(timer)
  }, [endsAt, gaveUp, session])

  // Away (the TV's home key, a locked phone): the WebView is never paused
  // (react-native-webview leaves onPause alone), so the embed goes, or the
  // channel would play on behind the launcher. Back: a fresh load at the live second.
  const [away, setAway] = useState(false)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        loaded.current = false
        setAway(true)
        return
      }
      setAway(false)
      reload()
    })
    return () => subscription.remove()
  }, [])

  // A stall: loaded, not finished early, and the position frozen for STALL_MS.
  const [stalled, setStalled] = useState(false)
  const lastProgressAt = useRef(0)
  const lastTime = useRef<number | null>(null)
  useEffect(() => {
    if (state.status !== 'ready' || away) {
      setStalled(false)
      return
    }
    const timer = setInterval(() => setStalled(!session.finishedEarly() && Date.now() - lastProgressAt.current >= STALL_MS), 1000)
    return () => clearInterval(timer)
  }, [state.status, state.reloadToken, session, away])
  const onStalledRef = useRef(onStalledChange)
  onStalledRef.current = onStalledChange
  useEffect(() => {
    onStalledRef.current?.(stalled)
  }, [stalled])

  const heard = useRef(false)
  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseHostMessage(event.nativeEvent.data)
    if (message?.kind === 'loaded') {
      loaded.current = true
      heard.current = false
      lastProgressAt.current = Date.now()
      lastTime.current = null
      dispatch({ type: 'loaded' })
      send(okru.playMessage)
      applySound()
      return
    }
    if (!message) return
    // The embed's first message: its player is up and listening now, so ask again.
    if (!heard.current) {
      heard.current = true
      applySound()
    }
    const row = session.current()?.unit.row
    const report = row ? okru.parse(message.data, row) : null
    if (report?.kind === 'time' && report.time !== lastTime.current) {
      lastTime.current = report.time
      lastProgressAt.current = Date.now()
      setStalled(false)
    }
    session.handle(message.data)
  }

  const upNext = () => {
    const after = scheduleAt(channel.plan, epochMs, endsAt, 1).current
    return `${programLabel(after.unit)} a las ${clockLabel(after.startsAt)}`
  }

  if (away) return <View style={styles.root} />

  return (
    <View style={styles.root}>
      {gaveUp ? (
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.cardTitle}>Señal interrumpida</Text>
          <Text style={styles.cardText}>{`Volvemos con ${upNext()}`}</Text>
        </View>
      ) : (
        <WebView
          key={state.reloadToken}
          ref={webRef}
          testID="live-webview"
          style={styles.web}
          source={{ html: hostHtml(src, okru.origin, { cropPx: OKRU_CHROME_PX }), baseUrl: siteUrl }}
          originWhitelist={['*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(request) => allowNavigation(request, siteUrl)}
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          // Live TV: the remote's keys belong to the screen, never to ok.ru's controls.
          focusable={!tv}
        />
      )}
      {!gaveUp && state.status === 'retrying' && (
        <View style={styles.pill} pointerEvents="none">
          <Text style={styles.pillText}>Reconectando…</Text>
        </View>
      )}
      {!gaveUp && session.finishedEarly() && (
        <View style={styles.card} pointerEvents="none">
          <Text style={styles.cardText}>{`A continuación: ${upNext()}`}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  card: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.color.bg },
  cardTitle: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.section },
  cardText: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body },
  pill: {
    position: 'absolute', top: '45%', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
    backgroundColor: theme.color.scrim,
  },
  pillText: { color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.meta },
})
