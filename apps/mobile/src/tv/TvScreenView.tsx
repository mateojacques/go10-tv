import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { backAction } from '@go10/core/player/playerKeys'
import { clockLabel, programLabel, progressOf } from '@go10/core/tv/describe'
import { stepChannel, writeLastChannel } from '@go10/core/tv/lineup'
import type { Channel, Lineup } from '@go10/core/tv/types'
import { usePlayerChrome } from '../platform/playerChrome'
import { useBackPress, useRemoteKeys } from '../platform/remote'
import { theme } from '../theme'
import { ChannelTile } from './ChannelTile'
import { liveKeyAction } from './liveKeys'
import { LiveVideo } from './LiveVideo'
import { useLiveNow } from './useLiveNow'

const tv = Platform.isTV

export const STRIP_IDLE_MS = 6000
/** A channel loads only once the zapping has stopped this long: each ok.ru load is heavy (the web's leanTv model). */
export const ZAP_SETTLE_MS = 600
/** A touch moving less than this is a tap; more, vertically, is a zap. */
export const SWIPE_PX = 60

/**
 * `/tv/[channel]` (apps/web/src/tv/TvScreen.tsx on TV hardware): one live
 * WebView, nothing over the picture until asked for, and a zap that loads
 * only where the zapping stops.
 */
export function TvScreenView({ lineup, channel, siteUrl, imageBase, onZap, onBack }: {
  lineup: Lineup
  channel: Channel
  siteUrl: string
  imageBase: string
  /** Zaps replace the route: Back leaves the TV screen instead of replaying zaps. */
  onZap: (channelId: string) => void
  onBack: () => void
}) {
  usePlayerChrome()
  const live = useLiveNow(lineup)
  const [stripOpen, setStripOpen] = useState(false)
  const [activity, bump] = useReducer((n: number) => n + 1, 0)
  const [failed, setFailed] = useState(false)
  const [stalled, setStalled] = useState(false)
  const [soundOn, setSoundOn] = useState(true)

  // The channel actually on air: the arrival plays at once, a zap waits for the zapping to stop.
  const [tuned, setTuned] = useState<Channel | null>(channel)
  useEffect(() => {
    if (tuned?.id === channel.id) {
      writeLastChannel(channel.id)
      return
    }
    setTuned(null)
    setFailed(false)
    setStalled(false)
    const timer = setTimeout(() => {
      writeLastChannel(channel.id)
      setTuned(channel)
    }, ZAP_SETTLE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id])

  useEffect(() => {
    if (!stripOpen) return
    const timer = setTimeout(() => setStripOpen(false), STRIP_IDLE_MS)
    return () => clearTimeout(timer)
  }, [stripOpen, activity])

  const wake = useCallback(() => {
    setStripOpen(true)
    bump()
  }, [])

  const zap = (step: 1 | -1) => onZap(stepChannel(lineup, channel.id, step).id)

  // A dead signal keeps the channels in view: the way out is a zap.
  const open = stripOpen || failed

  useRemoteKeys((key) => {
    const action = liveKeyAction(key, open)
    if (!action) return
    if (action.type === 'zap') zap(action.step)
    else if (action.type === 'reveal') wake()
    else bump()
  })

  useBackPress(() => {
    if (backAction(stripOpen) === 'closeBar') setStripOpen(false)
    else onBack()
    return true
  })

  // OK on the channel already playing: back to just the picture.
  const onTile = (picked: Channel) => {
    if (picked.id !== channel.id) onZap(picked.id)
    else setStripOpen(false)
  }

  // Touch (phone): a tap shows or hides the strip, a vertical swipe zaps.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (event: GestureResponderEvent) => {
    touch.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
  }
  const onTouchEnd = (event: GestureResponderEvent) => {
    const start = touch.current
    touch.current = null
    if (!start) return
    const dy = event.nativeEvent.pageY - start.y
    const dx = event.nativeEvent.pageX - start.x
    if (Math.abs(dy) >= SWIPE_PX && Math.abs(dy) > Math.abs(dx)) zap(dy < 0 ? 1 : -1)
    else if (open) setStripOpen(false)
    else wake()
  }

  const schedule = live.get(channel.id)
  const upNext = schedule?.next[0]
  const zapping = tuned?.id !== channel.id

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {tuned && !zapping && (
        <LiveVideo
          key={tuned.id}
          channel={tuned}
          epochMs={lineup.epochMs}
          siteUrl={siteUrl}
          soundOn={soundOn}
          onFailedChange={setFailed}
          onStalledChange={setStalled}
        />
      )}

      {/* An ad waiting for a tap (phone only; a TV autoplays) lets touches through to the embed. */}
      {!(stalled && !tv) && <View testID="tv-shield" style={StyleSheet.absoluteFill} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} />}

      {zapping && (
        <View testID="tv-flash" style={styles.flash} pointerEvents="none">
          <Text style={styles.flashText}>{channel.number}</Text>
        </View>
      )}

      {open && schedule && (
        <View style={styles.now}>
          <View style={styles.chip}>
            <Image source={{ uri: imageSrc(channel.collection.logo, imageBase) }} style={styles.chipLogo} contentFit="contain" />
            <Text style={styles.chipNumber}>{channel.number}</Text>
          </View>
          <View style={styles.nowText}>
            <Text style={styles.program} numberOfLines={1}>
              {programLabel(schedule.current.unit)}
            </Text>
            {upNext && (
              <Text style={styles.next} numberOfLines={1}>
                {`A continuación: ${programLabel(upNext.unit)} · ${clockLabel(upNext.startsAt)}`}
              </Text>
            )}
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: `${Math.round(progressOf(schedule) * 100)}%` }]} />
            </View>
          </View>
          {/* A TV has its own volume keys and Back; a phone gets the web's sound toggle and a back button. */}
          {!tv && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={soundOn ? 'Silenciar' : 'Activar sonido'}
              onPress={() => setSoundOn(!soundOn)}
              style={styles.iconBtn}
            >
              <Ionicons name={soundOn ? 'volume-high' : 'volume-mute'} size={22} color={theme.color.text} />
            </Pressable>
          )}
          {!tv && (
            <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={styles.iconBtn}>
              <Ionicons name="chevron-back" size={22} color={theme.color.text} />
            </Pressable>
          )}
        </View>
      )}

      {open && (
        <View style={styles.strip} accessibilityLabel="Canales" onTouchStart={bump}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
            {lineup.channels.map((c) => {
              const s = live.get(c.id)
              return s ? (
                <ChannelTile
                  key={c.id}
                  channel={c}
                  schedule={s}
                  imageBase={imageBase}
                  current={c.id === channel.id}
                  preferred={c.id === channel.id}
                  onSelect={onTile}
                />
              ) : null
            })}
          </ScrollView>
        </View>
      )}

      {stalled && !tv && (
        <View style={styles.tap} pointerEvents="none">
          <Text style={styles.tapText}>Tocá para ver</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flash: { ...StyleSheet.absoluteFill, alignItems: 'flex-end', justifyContent: 'flex-start', padding: 32, backgroundColor: '#000' },
  flashText: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: 64 },
  now: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: theme.space.safeX, paddingVertical: 12, backgroundColor: 'rgba(8, 9, 12, 0.85)',
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: theme.color.scrim },
  chipLogo: { width: 36, height: 20 },
  chipNumber: { color: theme.color.text, fontFamily: theme.font.monoMedium, fontSize: theme.size.body },
  nowText: { flex: 1, gap: 2 },
  program: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
  next: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  progress: { height: 3, marginTop: 4, borderRadius: 2, backgroundColor: theme.color.hairline, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: theme.color.accent },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  strip: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: theme.space.safeY, backgroundColor: 'rgba(8, 9, 12, 0.85)' },
  track: { paddingHorizontal: theme.space.safeX, paddingVertical: 12, gap: theme.space.gap },
  tap: {
    position: 'absolute', top: '45%', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
    backgroundColor: theme.color.scrim,
  },
  tapText: { color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.meta },
})
