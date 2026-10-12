import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { BRIDGE_SETTINGS, SETTING_LABELS, type MergedCaps } from '@go10/core/player/bridge/protocol'
import { theme } from '../../theme'
import type { BridgeLogEntry, BridgeStatus } from '../useEmbedBridge'

/**
 * What a remote tester photographs (spec: Android TV player controls → 4):
 * versions, the bridge's state and settings, the last keys and the bridge log.
 */
export function DiagnosticsPanel(p: {
  appVersion: string
  android: string
  webView: string
  provider: string
  status: BridgeStatus
  caps: MergedCaps
  keys: { key: string; effect: string }[]
  log: BridgeLogEntry[]
}) {
  const settings = BRIDGE_SETTINGS.flatMap((setting) => {
    const choice = p.caps[setting]
    if (!choice) return []
    const labels = choice.options.map((o) => o.label).join(', ')
    const current = choice.options.find((o) => o.value === choice.current)?.label ?? '?'
    return [`${SETTING_LABELS[setting]} (${choice.source}): ${labels} ← ${current}`]
  })
  return (
    <View style={styles.panel}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.head}>{`App ${p.appVersion} · Android ${p.android} · WebView ${p.webView}`}</Text>
        <Text style={styles.line}>{`Proveedor: ${p.provider}`}</Text>
        <Text style={styles.line}>{`Puente: ${p.status}`}</Text>
        {settings.length === 0 ? (
          <Text style={styles.line}>Ajustes: ninguno encontrado</Text>
        ) : (
          settings.map((line) => <Text key={line} style={styles.line}>{line}</Text>)
        )}
        <Text style={styles.section}>Teclas</Text>
        {p.keys.map((k, i) => <Text key={i} style={styles.line}>{`${k.key} → ${k.effect}`}</Text>)}
        <Text style={styles.section}>Registro</Text>
        {p.log.map((entry, i) => <Text key={i} style={styles.line}>{entry.text}</Text>)}
        <Text style={styles.foot}>Atrás para cerrar</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.color.scrim },
  body: { paddingHorizontal: theme.space.safeX, paddingVertical: theme.space.safeY, gap: 2 },
  head: { color: theme.color.text, fontFamily: theme.font.monoSemi, fontSize: theme.size.meta, marginBottom: 4 },
  section: { color: theme.color.accent, fontFamily: theme.font.monoSemi, fontSize: theme.size.meta, marginTop: 8 },
  line: { color: theme.color.textMeta, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  foot: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta, marginTop: 10 },
})
