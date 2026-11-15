// Piezas de voz compartidas por la cabina y el "oído" (la página que escucha en otra computadora).

// ---------- Medidor de volumen (mientras escucha y en la prueba) ----------
// El reconocimiento de voz del navegador no deja procesar el audio, pero sí podemos
// medirlo para avisar cuando no llega sonido o cuando la voz satura (gritos, ganancia alta).
export async function openMeter(onFrame) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctxA = new (window.AudioContext || window.webkitAudioContext)();
  const an = ctxA.createAnalyser(); an.fftSize = 1024;
  ctxA.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  let raf, quiet = 0, clipped = 0, frames = 0, verdict = 'ok';
  const loop = () => {
    an.getFloatTimeDomainData(buf);
    let sum = 0, peak = 0;
    for (const v of buf) { sum += v * v; const a = Math.abs(v); if (a > peak) peak = a; }
    const rms = Math.sqrt(sum / buf.length);
    frames++; if (peak > 0.97) clipped++;
    quiet = rms < 0.004 ? quiet + 1 : 0;
    if (frames >= 60) { // ~1 segundo
      verdict = clipped / frames > 0.04 ? 'satura' : quiet > 480 ? 'silencio' : 'ok';
      frames = 0; clipped = 0;
    }
    onFrame({ level: Math.min(100, Math.round(rms * 400)), peak, verdict: quiet > 480 ? 'silencio' : verdict });
    raf = requestAnimationFrame(loop);
  };
  loop();
  return { label: stream.getAudioTracks()[0]?.label || 'Micrófono predeterminado',
    close() { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); ctxA.close(); } };
}
export const METER_TXT = {
  satura: 'La voz está saturando (gritos o ganancia muy alta): baja la ganancia del micrófono o del receptor. Si satura, el reconocimiento no entiende.',
  silencio: 'No está llegando sonido. Revisa que el micrófono esté encendido y que sea el que usa el navegador.'
};

// Reconocimiento de voz continuo que se reinicia solo (el de Chrome se corta cada tanto).
export const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export function createListener({ lang = 'es-MX', onFinal, onInterim = () => {}, onStatus = () => {}, onStart = () => {}, onStop = () => {} }) {
  let rec = null, listening = false, restartDelay = 250;
  function start() {
    if (!SR) { onStatus('El reconocimiento de voz solo funciona en Google Chrome o Microsoft Edge.'); return false; }
    listening = true;
    rec = new SR();
    rec.lang = lang; rec.continuous = true; rec.interimResults = true;
    rec.onstart = () => { restartDelay = 250; onStart(); };
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinal(r[0].transcript.trim()); else interim += r[0].transcript;
      }
      onInterim(interim);
    };
    rec.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        listening = false; onStatus('El navegador no tiene permiso para usar el micrófono. Da clic en el candado de la barra de direcciones.');
      } else if (e.error === 'audio-capture') onStatus('No se detecta micrófono. Revisa que el receptor esté conectado.');
      else if (e.error === 'network') { onStatus('Sin internet: el reconocimiento de voz necesita conexión. Reintentando…'); restartDelay = Math.min(restartDelay * 2, 8000); }
      else onStatus('Error de voz: ' + e.error);
    };
    rec.onend = () => {
      if (listening) setTimeout(() => { if (listening) try { rec.start(); } catch {} }, restartDelay);
      else onStop();
    };
    try { rec.start(); } catch (err) { onStatus('No se pudo iniciar el micrófono: ' + err.message); return false; }
    return true;
  }
  function stop() { listening = false; try { rec?.stop(); } catch {} onStop(); }
  return { start, stop, get listening() { return listening; } };
}
