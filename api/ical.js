/* GET /api/ical?cabana=casa-oso&t=TOKEN[&para=airbnb|booking] → calendario .ics de la cabaña.
   Se pega este enlace en Airbnb / Booking ("importar calendario"). */
import { getDb, hoyMx, token, tokenValido } from './_lib.js';
import { crearIcs } from './_ical.js';

export default async (req, res) => {
  const { cabana = '', t = '', para = '' } = req.query || {};
  if (!/^[a-z0-9-]{1,60}$/.test(cabana) || !tokenValido(cabana, 'ical', t)) { res.status(403).send('Enlace no válido'); return; }
  const db = await getDb();
  if (!db) { res.status(503).send('Sin configurar'); return; }
  try {
    const snap = await db.collection('reservas').where('cabana', '==', cabana).where('estado', '==', 'confirmada').get();
    const hoy = hoyMx();
    // No se devuelve a una plataforma lo que ella misma nos envió
    const r = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.salida > hoy && !(x.tipo === 'externa' && x.origen === para));
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300');
    res.status(200).send(crearIcs('Cabañas Matilde ' + cabana, r));
  } catch (e) { console.error('ical', e); res.status(500).send('Error'); }
};
