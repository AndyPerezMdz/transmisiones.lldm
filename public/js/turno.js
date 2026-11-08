// "Turno" para editar algo entre varias personas: quien entra primero edita,
// los demás miran sin poder mover nada hasta que se vaya.
// Con Supabase usa Presence (se libera solo al cerrar la pestaña o perder conexión);
// en modo de prueba usa BroadcastChannel entre pestañas del mismo navegador.
import { demo, supa } from './db.js';

export function createTurno(name, me, onChange) {
  const key = me.id + ':' + Math.random().toString(36).slice(2, 8);
  let since = Date.now(), last = null;

  function decide(list) {
    const people = list.slice().sort((a, b) => a.since - b.since || (a.key < b.key ? -1 : 1));
    const holder = people[0] || null;
    const state = { mine: !holder || holder.key === key, holder, waiting: people.length - 1 };
    const sig = JSON.stringify([state.mine, holder?.key, state.waiting]);
    if (sig !== last) { last = sig; onChange(state); }
  }

  if (demo) {
    const bc = new BroadcastChannel('turno:' + name);
    const others = new Map();
    const info = () => ({ key, name: me.name, since });
    const send = type => bc.postMessage({ type, info: info() });
    const tick = () => {
      for (const [k, o] of others) if (Date.now() - o.seen > 6000) others.delete(k);
      decide([info(), ...[...others.values()].map(o => o.info)]);
    };
    bc.onmessage = e => {
      const { type, info: i } = e.data || {};
      if (!i || i.key === key) return;
      if (type === 'bye') others.delete(i.key);
      else { if (!others.has(i.key)) send('here'); others.set(i.key, { info: i, seen: Date.now() }); }
      tick();
    };
    send('here');
    const timer = setInterval(() => { send('here'); tick(); }, 2000);
    addEventListener('pagehide', () => send('bye'));
    setTimeout(tick, 400);
    return {
      take() { since = 0; send('here'); tick(); },
      release() { clearInterval(timer); send('bye'); bc.close(); }
    };
  }

  let channel = null;
  const track = () => channel?.track({ key, name: me.name, since });
  supa().then(sb => {
    channel = sb.channel('turno-' + name, { config: { presence: { key } } });
    channel.on('presence', { event: 'sync' }, () => decide(Object.values(channel.presenceState()).flat()))
      .subscribe(status => { if (status === 'SUBSCRIBED') track(); });
  });
  return {
    // Tomar el turno aunque alguien más lo tenga (por si dejaron la pestaña abierta).
    take() { since = 0; track(); },
    release() { channel?.untrack(); channel?.unsubscribe(); }
  };
}
