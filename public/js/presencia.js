// Semáforo: las páginas de gráficos que están abiertas en OBS avisan "aquí estoy"
// y la cabina cuenta cuántas hay. Con Supabase usa Presence; en modo demo, BroadcastChannel.
import { demo, supa } from './db.js';

const nombre = room => 'vivo-' + room;

// Lo llama el overlay (solo el de OBS, no la vista previa de la cabina).
export function anunciar(room, info) {
  const id = Math.random().toString(36).slice(2, 10);
  if (demo) {
    const bc = new BroadcastChannel(nombre(room));
    const decir = () => bc.postMessage({ id, ...info, at: Date.now() });
    decir(); setInterval(decir, 3000);
    bc.onmessage = e => { if (e.data?.pregunta) decir(); };
    return;
  }
  supa().then(sb => {
    const ch = sb.channel(nombre(room), { config: { presence: { key: id } } });
    ch.subscribe(st => { if (st === 'SUBSCRIBED') ch.track({ ...info, at: Date.now() }); });
  });
}

// Lo llama la cabina: avisa con la lista de fuentes de OBS conectadas cada vez que cambia.
export function vigilar(room, onCambio) {
  if (demo) {
    const vistos = new Map();
    const bc = new BroadcastChannel(nombre(room));
    const avisa = () => { for (const [k, v] of vistos) if (Date.now() - v.at > 8000) vistos.delete(k); onCambio([...vistos.values()]); };
    bc.onmessage = e => { if (e.data?.id) { vistos.set(e.data.id, { ...e.data, at: Date.now() }); avisa(); } };
    bc.postMessage({ pregunta: true });
    setInterval(avisa, 3000);
    return;
  }
  supa().then(sb => {
    const ch = sb.channel(nombre(room));
    ch.on('presence', { event: 'sync' }, () => onCambio(Object.values(ch.presenceState()).flat()))
      .subscribe();
  });
}
