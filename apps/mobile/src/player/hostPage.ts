/** Escapes a value for a double-quoted HTML attribute. */
function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * The page the player's WebView loads (inline, with `baseUrl` = the site):
 * one iframe plus a relay. Messages the embed posts from its own origin go
 * to RN as {kind:'embed'}; everything else is dropped. RN sends commands by
 * injecting `window.go10Command(cmd)` (see commandScript).
 *
 * The iframe is never sandboxed, unlike the web's vidlove iframe: vidlove
 * detects a sandbox and replaces the player with "This site broke the
 * player". The WebView's navigation guard and single-window setting keep
 * its ads from redirecting or opening windows instead.
 */
export function hostHtml(embedSrc: string, origin: string): string {
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe id="f" src="${attr(embedSrc)}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>
<script>
  var ORIGIN = ${JSON.stringify(origin)};
  var f = document.getElementById('f');
  function send(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  window.addEventListener('message', function (e) {
    if (e.origin === ORIGIN && e.source === f.contentWindow) send({ kind: 'embed', data: e.data });
  });
  window.go10Command = function (cmd) { f.contentWindow.postMessage(cmd, ORIGIN); };
  f.addEventListener('load', function () { send({ kind: 'loaded' }); });
</script>
</body></html>`
}

/** Script for `WebView.injectJavaScript` that posts `command` to the embed. */
export function commandScript(command: unknown): string {
  return `window.go10Command(${JSON.stringify(command)}); true;`
}

export type HostMessage = { kind: 'embed'; data: unknown } | { kind: 'loaded' }

export function parseHostMessage(raw: string): HostMessage | null {
  try {
    const message = JSON.parse(raw) as { kind?: string; data?: unknown } | null
    if (message?.kind === 'loaded') return { kind: 'loaded' }
    if (message?.kind === 'embed') return { kind: 'embed', data: message.data }
  } catch {
    // not ours
  }
  return null
}
