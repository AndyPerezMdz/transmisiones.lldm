// Enlace entre el "oído" (la computadora que tiene el micrófono) y la cabina.
// No viaja audio: solo el texto que reconoció y el nivel del micrófono.
// Con Supabase usa un canal de Realtime (broadcast); en modo de prueba, BroadcastChannel
// entre pestañas del mismo navegador.
import { demo, supa } from './db.js';

export function createOidoLink(room, onMessage) {
  const name = 'oido-' + room;
  if (demo) {
    const bc = new BroadcastChannel(name);
    bc.onmessage = e => onMessage(e.data || {});
    return { send: msg => bc.postMessage(msg), close: () => bc.close(), ready: Promise.resolve() };
  }
  let channel = null, queue = [];
  const ready = supa().then(sb => new Promise(resolve => {
    channel = sb.channel(name, { config: { broadcast: { self: false, ack: false } } });
    channel.on('broadcast', { event: 'm' }, ({ payload }) => onMessage(payload || {}))
      .subscribe(status => {
        if (status === 'SUBSCRIBED') { for (const m of queue) channel.send({ type: 'broadcast', event: 'm', payload: m }); queue = []; resolve(); }
      });
  }));
  return {
    send(msg) {
      if (channel?.state === 'joined') channel.send({ type: 'broadcast', event: 'm', payload: msg });
      else if (msg.t === 'voz') queue.push(msg); // lo importante no se pierde mientras conecta
    },
    close() { channel?.unsubscribe(); },
    ready
  };
}
