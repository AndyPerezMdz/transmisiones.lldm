// Oído: escucha en la computadora que tiene el micrófono y le manda el texto a la cabina.
import { demo, requireSession, roomId } from './db.js';
import { loadRoom } from './live.js';
import { createOidoLink } from './oido-link.js';
import { createListener, openMeter, METER_TXT, SR } from './voz.js';
import { $, mountNav, toast } from './ui.js';
import { icon } from './icons.js';

const room = roomId();
const btn = $('btnOido'), status = $('oidoStatus');
let ultimoParcial = 0, meter = null, wakeLock = null, cabinaVista = 0, nivel = { level: 0, verdict: 'ok' }, me = 'Oído';

const link = createOidoLink(room, msg => {
  if (msg.t === 'cabina') { cabinaVista = Date.now(); pintarCabina(msg.name); }
});
function pintarCabina(name) {
  const ok = Date.now() - cabinaVista < 12000;
  const box = $('estadoCabina');
  box.dataset.ok = ok ? '1' : '0';
  box.textContent = ok ? `La cabina está recibiendo${name ? ' (' + name + ')' : ''}.` : 'Esperando a la cabina… ábrela en la otra laptop, en esta misma sala.';
}
setInterval(() => pintarCabina(), 3000);

const listener = createListener({
  onStart() { setBtn(true); status.textContent = 'Escuchando. Lo que se diga le llega a la cabina.'; },
  onStop() { setBtn(false); status.textContent = 'Detenido. Presiona Empezar a escuchar para seguir.'; },
  onStatus: text => { status.textContent = text; },
  onInterim(text) {
    $('parcial').textContent = text;
    // Lo que va diciendo se manda como mucho una vez por segundo (Realtime cobra por mensaje).
    if (text && Date.now() - ultimoParcial > 1000) { ultimoParcial = Date.now(); link.send({ t: 'parcial', text: text.slice(-200) }); }
  },
  onFinal(text) {
    if (!text) return;
    $('parcial').textContent = '';
    link.send({ t: 'voz', text, at: Date.now() });
    const li = document.createElement('li'); li.textContent = text;
    $('ultimos').prepend(li);
    while ($('ultimos').children.length > 15) $('ultimos').lastChild.remove();
  }
});

function setBtn(on) {
  btn.classList.toggle('btn-rojo', on); btn.classList.toggle('btn-primario', !on);
  btn.replaceChildren(icon(on ? 'detener' : 'mic', { size: 22 }), on ? 'Dejar de escuchar' : 'Empezar a escuchar');
}

async function empezar() {
  if (!SR) return toast('Abre esta página en Google Chrome o Microsoft Edge.');
  if (!listener.start()) return;
  try {
    meter = await openMeter(v => {
      nivel = v;
      $('micNivel').style.width = v.level + '%';
      $('micNivelBox').dataset.estado = v.verdict;
      $('micAviso').textContent = METER_TXT[v.verdict] || '';
    });
    $('micNivelBox').hidden = false;
    $('micDevice').textContent = 'Escuchando con: ' + meter.label;
  } catch {}
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
function detener() {
  listener.stop();
  meter?.close(); meter = null; $('micNivelBox').hidden = true; $('parcial').textContent = '';
  wakeLock?.release?.(); wakeLock = null;
  enviarEstado();
}
btn.onclick = () => listener.listening ? detener() : empezar();
setBtn(false);
// Si la pantalla se bloqueó, al volver se pide de nuevo que no se apague.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && listener.listening && !wakeLock) try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
});

// Le dice a la cabina si está escuchando y cómo va el nivel: cada 1.5 s mientras escucha,
// cada 5 s cuando no (cada mensaje cuenta contra el límite mensual de Supabase Realtime).
let ultimoEstado = 0;
function enviarEstado() {
  ultimoEstado = Date.now();
  link.send({ t: 'estado', on: listener.listening, level: meter ? nivel.level : 0, verdict: meter ? nivel.verdict : 'ok', device: meter?.label || '', name: me, at: Date.now() });
}
setInterval(() => { if (Date.now() - ultimoEstado >= (listener.listening ? 1500 : 5000)) enviarEstado(); }, 500);
addEventListener('pagehide', () => link.send({ t: 'estado', on: false, bye: true, name: me, at: Date.now() }));

(async () => {
  const session = await requireSession();
  mountNav('cabina');
  me = demo ? 'Otra pestaña' : (session.user.user_metadata?.name || session.user.email || 'Oído');
  try {
    const saved = demo ? { name: 'Sala de prueba' } : await loadRoom(room);
    if (!saved) { $('salaNombre').textContent = 'Esa sala no existe'; btn.disabled = true; return; }
    $('salaNombre').textContent = saved.name;
    document.title = saved.name + ' · Oído · Cabina en Vivo';
    if ($('navSala')) $('navSala').textContent = saved.name;
  } catch (err) { toast(err.message); }
  if (!SR) { btn.disabled = true; status.textContent = 'Abre esta página en Google Chrome o Microsoft Edge: es lo que permite reconocer la voz.'; }
})();
