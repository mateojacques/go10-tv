import { Ionicons } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useReducer, useRef, useState, type ComponentProps } from 'react'
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { createPlaybackSession, LOAD_TIMEOUT_MS } from '@go10/core/player/playbackSession'
import { backoffMs, initialPlayerRetryState, playerRetryReducer } from '@go10/core/player/playerRetry'
import { providerFor } from '@go10/core/player/providers/index'
import { rowLabel } from '@go10/core/progress/describe'
import type { CatalogRow } from '@go10/core/types'
import { useBackPress, useRemoteKeys } from '../platform/remote'
import { commandScript, hostHtml, parseHostMessage } from '../player/hostPage'
import { allowNavigation } from '../player/navigationGuard'
import { backAction, playerKeyAction } from '../player/playerKeys'
import { theme } from '../theme'

const tv = Platform.isTV

function BarButton({ label, icon, onPress, disabled, preferred }: {
  label: string
  icon: ComponentProps<typeof Ionicons>['name']
  onPress?: () => void
  disabled?: boolean
  preferred?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hasTVPreferredFocus={preferred}
      onPress={onPress}
      style={({ focused }) => [styles.btn, focused && styles.btnFocused, disabled && styles.btnDisabled]}
    >
      {({ focused }) => <Ionicons name={icon} size={tv ? 16 : 22} color={focused ? theme.color.bg : theme.color.text} />}
    </Pressable>
  )
}

/**
 * The player (apps/web/src/screens/Player.tsx) on a WebView: the embed runs
 * in an inline host page on the site's origin, its messages drive a core
 * playback session, and commands go back through injected script. On TV the
 * WebView never takes focus, so every remote key reaches us.
 */
export function PlayerView({ row, siteUrl, onClose, onPrev, onNext }: {
  row: CatalogRow
  siteUrl: string
  onClose: () => void
  onPrev?: () => void
  /** The bar's next button, the remote's next key, and auto-advance at the end. */
  onNext?: () => void
}) {
  const provider = providerFor(row)
  const [retry, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  const [barOpen, setBarOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const webRef = useRef<WebView>(null)
  const loadedRef = useRef(false)
  const onNextRef = useRef(onNext)
  onNextRef.current = onNext

  // One session for the screen's life; it follows the row as episodes change.
  const [session] = useState(() =>
    createPlaybackSession({
      send: (command) => webRef.current?.injectJavaScript(commandScript(command)),
      onEnded: () => onNextRef.current?.(),
      onPlayingChange: setPlaying,
    }),
  )

  // A new file starts over: fresh retry state and a reload (the reset bumps reloadToken).
  const videoRef = useRef(row.video_id)
  useEffect(() => {
    if (videoRef.current === row.video_id) return
    videoRef.current = row.video_id
    loadedRef.current = false
    dispatch({ type: 'reset' })
  }, [row.video_id])

  // Computed once per load (a new file or a retry), never per render: a new
  // src would restart the video. load() also saves the outgoing position, so
  // a retry resumes from the very latest one.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const src = useMemo(() => session.load(row), [retry.reloadToken])

  // Another chapter of the loaded file: seek, don't reload.
  useEffect(() => {
    session.select(row)
  }, [row, session])

  // Save on leaving the screen and whenever the app goes to the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') session.flush()
    })
    return () => {
      subscription.remove()
      session.flush()
    }
  }, [session])

  useEffect(() => {
    if (retry.status === 'loading') {
      const timer = setTimeout(() => {
        if (!loadedRef.current) dispatch({ type: 'timeout' })
      }, LOAD_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    if (retry.status === 'retrying') {
      const timer = setTimeout(() => {
        loadedRef.current = false
        dispatch({ type: 'retryLoadStarted' })
      }, backoffMs(retry.attempt))
      return () => clearTimeout(timer)
    }
  }, [retry.status, retry.attempt, retry.reloadToken])

  const leave = () => {
    session.flush()
    onClose()
  }

  useBackPress(() => {
    if (backAction(barOpen) === 'closeBar') setBarOpen(false)
    else leave()
    return true
  })

  useRemoteKeys((key) => {
    const action = playerKeyAction(key, barOpen)
    if (!action) return
    if (action.type === 'seekBy') session.seekBy(action.delta)
    else if (action.type === 'togglePlay') session.togglePlay()
    else if (action.type === 'openBar') setBarOpen(true)
    else if (action.type === 'next') onNext?.()
    else onPrev?.()
  })

  const onMessage = (event: WebViewMessageEvent) => {
    const message = parseHostMessage(event.nativeEvent.data)
    if (message?.kind === 'loaded') {
      loadedRef.current = true
      dispatch({ type: 'loaded' })
    } else if (message) {
      session.handle(message.data)
    }
  }

  const canToggle = session.canTogglePlay()
  const position = rowLabel(row)

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {retry.status === 'failed' ? (
        <View style={styles.fallback}>
          <Text style={styles.fallbackMsg}>No se pudo reproducir aquí.</Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={provider.fallbackLabel}
            hasTVPreferredFocus
            onPress={() => void Linking.openURL(row.video_url)}
            style={({ focused }) => [styles.open, focused && styles.openFocused]}
          >
            <Text style={styles.openText}>{provider.fallbackLabel}</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          key={retry.reloadToken}
          ref={webRef}
          testID="player-webview"
          style={styles.web}
          source={{ html: hostHtml(src, provider.origin, provider.sandbox), baseUrl: siteUrl }}
          originWhitelist={['*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(request) => allowNavigation(request, siteUrl)}
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          focusable={!tv}
        />
      )}

      {retry.status === 'retrying' && (
        <View style={styles.reconnecting} pointerEvents="none">
          <Text style={styles.reconnectingText}>Reconectando…</Text>
        </View>
      )}

      {barOpen && (
        <View style={styles.bar}>
          <BarButton label="Volver" icon="chevron-back" onPress={leave} preferred={!canToggle} />
          <View style={styles.heading}>
            <Text style={styles.title} numberOfLines={1}>{row.series_title || row.title}</Text>
            {position !== '' && <Text style={styles.season}>{position}</Text>}
          </View>
          {(onPrev || onNext || canToggle) && (
            <View style={styles.steps}>
              {(onPrev || onNext) && <BarButton label="Episodio anterior" icon="play-skip-back" onPress={onPrev} disabled={!onPrev} />}
              {canToggle && (
                <BarButton label="Pausar o reproducir" icon={playing ? 'pause' : 'play'} onPress={() => session.togglePlay()} preferred />
              )}
              {(onPrev || onNext) && <BarButton label="Episodio siguiente" icon="play-skip-forward" onPress={onNext} disabled={!onNext} />}
            </View>
          )}
        </View>
      )}

      {/* Touch: a small tab at the top edge drops the bar down (TV opens it from the remote). */}
      {!tv && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={barOpen ? 'Ocultar controles' : 'Mostrar controles'}
          onPress={() => setBarOpen((open) => !open)}
          style={[styles.handle, barOpen && styles.handleOpen]}
        >
          <Ionicons name={barOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.color.text} />
        </Pressable>
      )}
    </View>
  )
}

const BAR_H = tv ? 44 : 56

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, height: BAR_H, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: tv ? theme.space.safeX : 8, backgroundColor: 'rgba(8, 9, 12, 0.94)',
    borderBottomWidth: 1, borderBottomColor: theme.color.hairline,
  },
  heading: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  title: { flexShrink: 1, color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
  season: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  steps: { flexDirection: 'row', gap: 4 },
  btn: { width: tv ? 32 : 44, height: tv ? 32 : 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  btnFocused: { backgroundColor: theme.color.accent, transform: [{ scale: 1.08 }] },
  btnDisabled: { opacity: 0.3 },
  handle: {
    position: 'absolute', top: 0, left: '50%', marginLeft: -28, width: 56, height: 32, alignItems: 'center', justifyContent: 'center',
    opacity: 0.6,
  },
  handleOpen: { top: BAR_H, opacity: 0.85 },
  reconnecting: { position: 'absolute', top: '45%', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.color.scrim },
  reconnectingText: { color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: theme.color.bg },
  fallbackMsg: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body },
  open: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: theme.radius, backgroundColor: 'rgba(242,244,240,0.08)', borderWidth: 1, borderColor: theme.color.hairline },
  openFocused: { backgroundColor: theme.color.accent },
  openText: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
})
