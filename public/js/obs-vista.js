// Vista de OBS en la cabina: la cámara virtual de OBS viaja por VDO.Ninja (WebRTC, de laptop a laptop).
const streamId = room => 'cev' + String(room).replace(/[^a-z0-9]/gi, '').slice(0, 24);
// Se abre en la laptop de OBS: manda la "OBS Virtual Camera" sin audio y en calidad baja (solo es para ver).
export const obsPushUrl = room => `https://vdo.ninja/?push=${streamId(room)}&videodevice=obs&audiodevice=0&autostart&quality=2&label=OBS`;
// Se ve dentro de la cabina, sin controles ni sonido.
export const obsViewUrl = room => `https://vdo.ninja/?view=${streamId(room)}&cleanoutput&noaudio`;
