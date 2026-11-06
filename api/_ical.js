/* iCal (.ics): leer calendarios de Airbnb/Booking y publicar el nuestro. */
import { hoyMx, esFecha } from './_lib.js';

const aIso = (v) => { const m = /(\d{4})(\d{2})(\d{2})/.exec(v || ''); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };

/** Eventos [{uid, entrada, salida}] de un archivo .ics (DTEND se toma como día de salida). */
export function leerIcs(texto) {
  const lineas = String(texto).replace(/\r/g, '').replace(/\n[ \t]/g, '').split('\n'); // desdobla líneas largas
  const out = [];
  let ev = null;
  for (const l of lineas) {
    if (l.startsWith('BEGIN:VEVENT')) ev = {};
    else if (l.startsWith('END:VEVENT')) {
      if (ev && ev.entrada) {
        if (!ev.salida || ev.salida <= ev.entrada) { const d = new Date(ev.entrada + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); ev.salida = d.toISOString().slice(0, 10); }
        if (esFecha(ev.entrada) && esFecha(ev.salida)) out.push(ev);
      }
      ev = null;
    } else if (ev) {
      const i = l.indexOf(':'); if (i < 0) continue;
      const nombre = l.slice(0, i).split(';')[0].toUpperCase(), valor = l.slice(i + 1);
      if (nombre === 'DTSTART') ev.entrada = aIso(valor);
      else if (nombre === 'DTEND') ev.salida = aIso(valor);
      else if (nombre === 'UID') ev.uid = valor.slice(0, 120);
      else if (nombre === 'STATUS' && /CANCEL/i.test(valor)) ev.cancelado = true;
    }
  }
  return out.filter((e) => !e.cancelado);
}

const fechaIcs = (iso) => iso.replace(/-/g, '');
const esc = (s) => String(s || '').replace(/[\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');

/** Calendario .ics con las noches ocupadas de una cabaña. */
export function crearIcs(nombre, reservas) {
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = reservas.map((r, i) => [
    'BEGIN:VEVENT', `UID:${r.id || i}@cabanas-matilde`, `DTSTAMP:${sello}`,
    `DTSTART;VALUE=DATE:${fechaIcs(r.entrada)}`, `DTEND;VALUE=DATE:${fechaIcs(r.salida)}`,
    'SUMMARY:Ocupado', 'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cabanas Matilde//ES', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(nombre)}`, ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

const urlOk = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname.includes('.') && !/^(\d+\.){3}\d+$/.test(x.hostname); } catch { return false; } };
const PLAT = ['airbnb', 'booking'];

/** Lee los calendarios configurados y reemplaza las reservas "externas". Si una descarga falla, conserva lo anterior. */
export async function sincronizar(db) {
  const cfgRef = db.collection('config').doc('ical');
  const cfg = (await cfgRef.get()).data() || {};
  const hoy = hoyMx();
  const resumen = [];
  for (const [cabana, urls] of Object.entries(cfg.cabanas || {})) {
    for (const origen of PLAT) {
      const u = urls && urls[origen];
      if (!u) continue;
      if (!urlOk(u)) { resumen.push({ cabana, origen, error: 'Enlace no válido' }); continue; }
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'CabanasMatilde-iCal/1.0' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const texto = await r.text();
        if (!texto.includes('BEGIN:VCALENDAR')) throw new Error('No es un calendario');
        const evs = leerIcs(texto).filter((e) => e.salida > hoy).slice(0, 500);
        const viejos = await db.collection('reservas').where('tipo', '==', 'externa').where('cabana', '==', cabana).where('origen', '==', origen).get();
        await Promise.all(viejos.docs.map((d) => d.ref.delete()));
        const ahora = new Date().toISOString();
        await Promise.all(evs.map((e) => db.collection('reservas').add({
          cabana, cabanaNombre: '', tipo: 'externa', origen, estado: 'confirmada', nombre: origen === 'airbnb' ? 'Airbnb' : 'Booking',
          entrada: e.entrada, salida: e.salida, noches: Math.round((Date.parse(e.salida) - Date.parse(e.entrada)) / 864e5),
          uid: e.uid || '', telefono: '', email: '', notas: '', adultos: 0, ninos: 0, mascotas: 0, total: 0, adelanto: 0,
          codigo: origen.toUpperCase().slice(0, 3) + '-' + (e.uid || e.entrada).slice(0, 6), creada: ahora,
        })));
        resumen.push({ cabana, origen, eventos: evs.length });
      } catch (e) { resumen.push({ cabana, origen, error: String(e.message || e).slice(0, 80) }); }
    }
  }
  await cfgRef.set({ ...cfg, sync: new Date().toISOString(), resumen }, { merge: false });
  return resumen;
}
export { PLAT, urlOk };
