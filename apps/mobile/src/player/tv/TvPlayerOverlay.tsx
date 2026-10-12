import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatClock } from '@go10/core/lib/format'
import { BRIDGE_SETTINGS, SETTING_LABELS, type BridgeSetting, type MergedCaps } from '@go10/core/player/bridge/protocol'
import type { Timeline } from '@go10/core/player/playbackSession'
import type { TvControlsState, TvInput } from '@go10/core/player/tvControls'
import { theme } from '../../theme'

type IconName = ComponentProps<typeof Ionicons>['name']

const ICONS: Record<BridgeSetting, IconName> = {
  quality: 'options', subtitles: 'chatbox-ellipses', audio: 'musical-notes', speed: 'speedometer', server: 'server',
}

/** Position and length within the chapter (or file); "—" until the length is known. */
function clock(time: number, { start, end }: Timeline): string {
  return `${formatClock(time - start)} / ${end === null ? '—' : formatClock(end - start)}`
}

function Bar({ time, timeline, focused }: { time: number; timeline: Timeline; focused?: boolean }) {
  const span = timeline.end === null ? 0 : timeline.end - timeline.start
  const fraction = span > 0 ? Math.min(1, Math.max(0, (time - timeline.start) / span)) : 0
  return (
    <View style={[styles.track, focused && styles.trackFocused]}>
      <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
      {focused && <View style={[styles.knob, { left: `${fraction * 100}%` }]} />}
    </View>
  )
}

function Button({ label, icon, onPress, preferred }: { label: string; icon: IconName; onPress: () => void; preferred?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hasTVPreferredFocus={preferred}
      onPress={onPress}
      style={({ focused }) => [styles.btn, focused && styles.btnFocused]}
    >
      {({ focused }) => (
        <>
          <Ionicons name={icon} size={16} color={focused ? theme.color.bg : theme.color.text} />
          {focused && <Text style={styles.btnLabel} numberOfLines={1}>{label}</Text>}
        </>
      )}
    </Pressable>
  )
}

/**
 * The TV player's controls (spec: Android TV player controls → 1): a seek
 * toast while hidden, else title, timeline and buttons. Keys are handled by
 * core's tvControls in PlayerView; this only renders and reports focus and
 * presses. A settings button exists only while the embed reports that setting.
 */
export function TvPlayerOverlay(p: {
  title: string
  /** rowLabel(row) */
  position: string
  controls: TvControlsState
  timeline: Timeline
  playing: boolean
  canToggle: boolean
  hasPrev: boolean
  hasNext: boolean
  caps: MergedCaps
  /** Last immediate seek (overlay hidden), for the toast; null hides it. */
  toast: { target: number; at: number } | null
  dispatch: (input: TvInput) => void
  onTogglePlay: () => void
  onPrev: () => void
  onNext: () => void
  onSetting: (setting: BridgeSetting) => void
}) {
  const { mode, scrub } = p.controls
  if (mode === 'hidden') {
    if (!p.toast) return null
    return (
      <View style={styles.toast} pointerEvents="none">
        <Bar time={p.toast.target} timeline={p.timeline} />
        <Text style={styles.clock}>{clock(p.toast.target, p.timeline)}</Text>
      </View>
    )
  }
  if (mode === 'pointer' || mode === 'diagnostics') return null

  const scrubbing = mode === 'scrubbing' && scrub !== null
  const shown = scrubbing ? scrub.target : p.timeline.time
  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Text style={styles.title} numberOfLines={1}>{p.title}</Text>
        {p.position !== '' && <Text style={styles.meta}>{p.position}</Text>}
      </View>
      <Pressable
        accessibilityLabel="Línea de tiempo"
        focusable
        onFocus={() => p.dispatch({ type: 'scrubFocus', timeline: p.timeline })}
        onBlur={() => p.dispatch({ type: 'scrubBlur' })}
        onPress={() => p.dispatch({ type: 'scrubPress', timeline: p.timeline })}
        style={styles.timeline}
      >
        <Bar time={shown} timeline={p.timeline} focused={scrubbing} />
      </Pressable>
      <View style={styles.row}>
        <Text style={styles.clock}>{clock(shown, p.timeline)}</Text>
        <View style={styles.buttons}>
          {p.canToggle && (
            <Button label={p.playing ? 'Pausar' : 'Reproducir'} icon={p.playing ? 'pause' : 'play'} onPress={p.onTogglePlay} preferred />
          )}
          {p.hasPrev && <Button label="Episodio anterior" icon="play-skip-back" onPress={p.onPrev} preferred={!p.canToggle} />}
          {p.hasNext && (
            <Button label="Episodio siguiente" icon="play-skip-forward" onPress={p.onNext} preferred={!p.canToggle && !p.hasPrev} />
          )}
          {BRIDGE_SETTINGS.map((setting) => {
            const choice = p.caps[setting]
            if (!choice) return null
            const current = choice.options.find((o) => o.value === choice.current)?.label
            const label = current ? `${SETTING_LABELS[setting]}: ${current}` : SETTING_LABELS[setting]
            return <Button key={setting} label={label} icon={ICONS[setting]} onPress={() => p.onSetting(setting)} />
          })}
          <Button
            label="Modo puntero"
            icon="locate"
            onPress={() => p.dispatch({ type: 'pointer' })}
            preferred={!p.canToggle && !p.hasPrev && !p.hasNext}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, gap: 8,
    paddingHorizontal: theme.space.safeX, paddingTop: 14, paddingBottom: theme.space.safeY, backgroundColor: 'rgba(8, 9, 12, 0.88)',
  },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  title: { flexShrink: 1, color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.section },
  meta: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  timeline: { paddingVertical: 6 },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(242, 244, 240, 0.18)' },
  trackFocused: { height: 6, borderRadius: 3 },
  fill: { height: '100%', borderRadius: 3, backgroundColor: theme.color.accent },
  knob: {
    position: 'absolute', top: -5, marginLeft: -8, width: 16, height: 16, borderRadius: 8,
    backgroundColor: theme.color.accent, borderWidth: 2, borderColor: theme.color.bg,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clock: { color: theme.color.textMeta, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  buttons: { flexDirection: 'row', gap: 6 },
  btn: { height: 32, minWidth: 32, paddingHorizontal: 8, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnFocused: { backgroundColor: theme.color.accent },
  btnLabel: { color: theme.color.bg, fontFamily: theme.font.displaySemi, fontSize: theme.size.meta },
  toast: { position: 'absolute', left: theme.space.safeX, right: theme.space.safeX, bottom: theme.space.safeY, gap: 6 },
})
