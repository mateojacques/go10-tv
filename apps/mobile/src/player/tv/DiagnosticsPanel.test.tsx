import { render, screen } from '@testing-library/react-native'
import { DiagnosticsPanel } from './DiagnosticsPanel'

it('shows everything a tester needs in one photo', async () => {
  await render(
    <DiagnosticsPanel
      appVersion="1.0.0" android="12" webView="129.0.6668" provider="https://ok.ru" status="installed"
      caps={{ quality: { options: [{ value: 'sd', label: '480p' }, { value: 'hd', label: '720p' }], current: 'hd', source: 'okru', frame: 'f' } }}
      keys={[{ key: 'right', effect: 'seekBy' }, { key: 'select', effect: '—' }]}
      log={[{ at: 0, text: 'instalación: installed' }]}
    />,
  )
  for (const text of [
    'App 1.0.0 · Android 12 · WebView 129.0.6668', 'Proveedor: https://ok.ru', 'Puente: installed',
    'Calidad (okru): 480p, 720p ← 720p', 'right → seekBy', 'select → —', 'instalación: installed', 'Atrás para cerrar',
  ]) {
    expect(screen.getByText(text)).toBeTruthy()
  }
})

it('says when no settings were found', async () => {
  await render(<DiagnosticsPanel appVersion="1" android="12" webView="?" provider="p" status="unsupported" caps={{}} keys={[]} log={[]} />)
  expect(screen.getByText('Ajustes: ninguno encontrado')).toBeTruthy()
})
