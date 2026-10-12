import { requireOptionalNativeModule } from 'expo'

interface EmbedBridgeNative {
  install(viewTag: number, script: string, origins: string[]): Promise<string>
  tap(viewTag: number, xDp: number, yDp: number): Promise<boolean>
  webViewVersion(): string
}

/** modules/embed-bridge; absent in tests and in builds made before it existed. */
const native = requireOptionalNativeModule<EmbedBridgeNative>('EmbedBridge')

export type InstallResult = 'installed' | 'unsupported' | 'noView' | 'noModule' | 'error'

/** Runs `script` at document start in every frame of the WebView on `origins`. Must happen before the embed loads. */
export async function installBridge(viewTag: number | null, script: string, origins: string[]): Promise<InstallResult> {
  if (!native) return 'noModule'
  if (viewTag == null) return 'noView'
  try {
    return (await native.install(viewTag, script, origins)) as InstallResult
  } catch {
    return 'error'
  }
}

/** A finger tap on the WebView at (x, y) dp from its top-left. */
export function tapWebView(viewTag: number | null, xDp: number, yDp: number): void {
  if (native && viewTag != null) native.tap(viewTag, xDp, yDp).catch(() => {})
}

export function webViewVersion(): string {
  try {
    return native?.webViewVersion() ?? '?'
  } catch {
    return '?'
  }
}
