import { PROVIDER_ADAPTERS } from './adapters'

/**
 * The script the embed bridge injects at document start into every frame on
 * BRIDGE_ORIGINS (spec: Android TV player controls → 2). Each adapter is
 * `{name, read() → caps, set(setting, value) → boolean, check?(setting, value)
 * → boolean}`; with `check`, the answer waits CHECK_MS and reports whether
 * the change took (an embed may undo it). Every call is
 * guarded, so a broken adapter only loses its own settings. Reports go to the
 * top window (our host page) whenever they change; the host relays them to RN.
 *
 * A string, not a function's source: Hermes keeps no function source.
 */
export function frameScript(providerAdapters: string[] = PROVIDER_ADAPTERS): string {
  const providers = providerAdapters.map((source) => `${source},\n`).join('')
  return `(function () {
  if (window.__go10Bridge) return;
  window.__go10Bridge = true;
  var frame = Math.random().toString(36).slice(2);
  var SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5', '2'];
  function subs(v) {
    return [].filter.call(v.textTracks || [], function (t) { return t.kind === 'subtitles' || t.kind === 'captions'; });
  }
  var html5 = {
    name: 'html5',
    read: function () {
      var v = document.querySelector('video');
      if (!v) return {};
      var caps = { speed: {
        options: SPEEDS.map(function (s) { return { value: s, label: s === '1' ? 'Normal' : s.replace('.', ',') + '×' }; }),
        current: String(v.playbackRate)
      } };
      var tracks = subs(v);
      if (tracks.length) {
        var current = 'off';
        var options = [{ value: 'off', label: 'Desactivados' }];
        tracks.forEach(function (t, i) {
          options.push({ value: String(i), label: t.label || t.language || ('Pista ' + (i + 1)) });
          if (t.mode === 'showing') current = String(i);
        });
        caps.subtitles = { options: options, current: current };
      }
      var audio = v.audioTracks;
      if (audio && audio.length > 1) {
        var aCurrent = null, aOptions = [];
        for (var i = 0; i < audio.length; i++) {
          aOptions.push({ value: String(i), label: audio[i].label || audio[i].language || ('Pista ' + (i + 1)) });
          if (audio[i].enabled) aCurrent = String(i);
        }
        caps.audio = { options: aOptions, current: aCurrent };
      }
      return caps;
    },
    set: function (setting, value) {
      var v = document.querySelector('video');
      if (!v) return false;
      if (setting === 'speed') { v.playbackRate = Number(value); return true; }
      if (setting === 'subtitles') {
        subs(v).forEach(function (t, i) { t.mode = String(i) === value ? 'showing' : 'disabled'; });
        return true;
      }
      if (setting === 'audio' && v.audioTracks) {
        for (var i = 0; i < v.audioTracks.length; i++) v.audioTracks[i].enabled = String(i) === value;
        return true;
      }
      return false;
    },
    check: function (setting, value) {
      var v = document.querySelector('video');
      if (!v) return false;
      if (setting === 'speed') return String(v.playbackRate) === value;
      if (setting === 'subtitles') {
        var showing = 'off';
        subs(v).forEach(function (t, i) { if (t.mode === 'showing') showing = String(i); });
        return showing === value;
      }
      if (setting === 'audio' && v.audioTracks) {
        for (var i = 0; i < v.audioTracks.length; i++) if (v.audioTracks[i].enabled) return String(i) === value;
      }
      return false;
    }
  };
  var adapters = [
${providers}html5];
  var last = {};
  function post(message) { try { window.top.postMessage(message, '*'); } catch (e) {} }
  function report() {
    adapters.forEach(function (a) {
      var caps;
      try { caps = a.read() || {}; } catch (e) { return; }
      var json = JSON.stringify(caps);
      if (json === last[a.name]) return;
      last[a.name] = json;
      post({ go10Bridge: 'caps', source: a.name, frame: frame, caps: caps });
    });
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source !== window.top || !d || d.go10Bridge !== 'set' || d.frame !== frame) return;
    var a = adapters.filter(function (x) { return x.name === d.source; })[0];
    if (!a) return;
    var result = { go10Bridge: 'result', id: d.id, ok: false };
    try { result.ok = a.set(d.setting, d.value) === true; } catch (err) { result.error = String(err); }
    if (!result.ok || !a.check) {
      post(result);
      setTimeout(report, 300);
      return;
    }
    setTimeout(function () {
      try { result.ok = a.check(d.setting, d.value) === true; } catch (err) { result.ok = false; result.error = String(err); }
      post(result);
      report();
    }, 300);
  });
  window.addEventListener('pagehide', function () { post({ go10Bridge: 'bye', frame: frame }); });
  setInterval(report, 1000);
})();`
}
