/* GET /api/sync → sincroniza los calendarios de Airbnb/Booking. Lo llama el cron de Vercel (una vez al día).
   Acepta Authorization: Bearer CRON_SECRET (lo envía Vercel) o ?clave=RESERVAS_SECRET. */
import crypto from 'node:crypto';
import { getDb, json } from './_lib.js';
import { sincronizar } from './_ical.js';

const igual = (a, b) => a && b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export default async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
  const ok = igual(bearer, process.env.CRON_SECRET || '') || igual(String((req.query || {}).clave || ''), process.env.RESERVAS_SECRET || '');
  if (!ok) return json(res, 403, { error: 'No autorizado.' });
  const db = await getDb();
  if (!db) return json(res, 503, { error: 'Sin base de datos.' });
  try { json(res, 200, { ok: true, resumen: await sincronizar(db) }); }
  catch (e) { console.error('sync', e); json(res, 500, { error: 'Error al sincronizar.' }); }
};
