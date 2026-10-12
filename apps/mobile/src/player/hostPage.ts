/** Escapes a value for a double-quoted HTML attribute. */
function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/** ok.ru's title bar and control bar, cropped off live TV (the web's --go-okru-chrome). */
export const OKRU_CHROME_PX = 64

/**
 * The page the player's WebView loads (inline, with `baseUrl` = the site):
 * one iframe plus a relay. Messages the embed posts from its own origin go
 * to RN as {kind:'embed'}; everything else is dropped. RN sends commands by
 * injecting `window.go10Command(cmd)` (see commandScript).
 *
 * With `bridgeOrigins`, `{go10Bridge}` messages from frames on those origins
 * (nested ones included) go to RN as {kind:'bridge'}, and `window.go10Bridge`
 * sends a command to every frame (see bridgeScript and core's player/bridge).
 *
 * The iframe is never sandboxed: vidlove detects a sandbox and replaces
 * the player with "This site broke the player". The WebView's navigation
 * guard and single-window setting keep its ads from redirecting or opening
 * windows instead.
 */
export function hostHtml(
  embedSrc: string,
  origin: string,
  { cropPx = 0, bridgeOrigins = [] }: { cropPx?: number; bridgeOrigins?: string[] } = {},
): string {
  const frame =
    cropPx > 0
      ? `iframe{border:0;position:absolute;left:0;top:-${cropPx}px;width:100%;height:calc(100% + ${2 * cropPx}px)}`
      : 'iframe{border:0;width:100%;height:100%}'
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;position:relative}${frame}</style>
</head><body>
<iframe id="f" src="${attr(embedSrc)}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>
<script>
  var ORIGIN = ${JSON.stringify(origin)};
  var BRIDGE = ${JSON.stringify(bridgeOrigins)};
  var f = document.getElementById('f');
  function send(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  window.addEventListener('message', function (e) {
    var d = e.data;
    // The bridge script runs in nested frames too, so it is trusted by origin, not by source.
    if (d && typeof d === 'object' && typeof d.go10Bridge === 'string') {
      if (BRIDGE.indexOf(e.origin) >= 0) send({ kind: 'bridge', data: d });
      return;
    }
    if (e.origin === ORIGIN && e.source === f.contentWindow) send({ kind: 'embed', data: d });
  });
  window.go10Command = function (cmd) { f.contentWindow.postMessage(cmd, ORIGIN); };
  function broadcast(w, cmd) {
    try { w.postMessage(cmd, '*'); } catch (x) {}
    for (var i = 0; i < w.frames.length; i++) broadcast(w.frames[i], cmd);
  }
  window.go10Bridge = function (cmd) { broadcast(f.contentWindow, cmd); };
  f.addEventListener('load', function () { send({ kind: 'loaded' }); });
</script>
</body></html>`
}

/** Script for `WebView.injectJavaScript` that posts `command` to the embed. */
export function commandScript(command: unknown): string {
  return `window.go10Command(${JSON.stringify(command)}); true;`
}

/** Script for `WebView.injectJavaScript` that sends a bridge command to every frame of the embed. */
export function bridgeScript(command: unknown): string {
  return `window.go10Bridge(${JSON.stringify(command)}); true;`
}

export type HostMessage = { kind: 'embed'; data: unknown } | { kind: 'bridge'; data: unknown } | { kind: 'loaded' }

export function parseHostMessage(raw: string): HostMessage | null {
  try {
    const message = JSON.parse(raw) as { kind?: string; data?: unknown } | null
    if (message?.kind === 'loaded') return { kind: 'loaded' }
    if (message?.kind === 'embed') return { kind: 'embed', data: message.data }
    if (message?.kind === 'bridge') return { kind: 'bridge', data: message.data }
  } catch {
    // not ours
  }
  return null
}
