import { DateTime } from 'luxon';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://1.cycloscope.online';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFhMTc2MWNkLWNlZjktNGE1ZC05OTcxLTU1MzhmNzU3NDM0OCIsInJvbGU6ImVhNjI0NzcwLTlkMjAtNDU2My05ODkzLTYwMDZlNGE3NmNmYSIsImFwcF9hY2Nlc3MiOnRydWUsImFkbWluX2FjY2VzcyI6dHJ1ZSwiaWF0IjoxNzU0NDAxMDcyLCJleHAiOjE4MTc0NzMwNzIsImlzcyI6ImRpcmVjdHVzIn0.vJk2OE7gYRe5cYyhHcu5UwOdRqJdn2cRpuYzsAGTHI0';
const COLL_MASTERS = process.env.DIRECTUS_COLL_MASTERS || 'zaply_masters';
const COLL_SERVICES = process.env.DIRECTUS_COLL_SERVICES || 'zaply_services';
const COLL_CLIENTS = process.env.DIRECTUS_COLL_CLIENTS || 'zaply_clients';
const COLL_BOOKINGS = process.env.DIRECTUS_COLL_BOOKINGS || 'zaply_bookings';
const DEFAULT_TZ = 'Europe/Moscow';

async function dFetch(path, opts = {}) {
  const res = await fetch(`${DIRECTUS_URL.replace(/\/$/, '')}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DIRECTUS_TOKEN}`,
      ...(opts.headers || {})
    },
    ...opts,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Directus ${res.status}: ${txt}`);
  }
  return res.json();
}

async function getMasterBySlug(slug) {
  const u = new URL(`/items/${COLL_MASTERS}`, DIRECTUS_URL);
  u.searchParams.set('limit', '1');
  u.searchParams.set('filter[slug][_eq]', String(slug));
  const j = await dFetch(u.pathname + '?' + u.searchParams.toString());
  return (j.data && j.data[0]) || null;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { slug, serviceId, startISO, name, phone } = req.body || {};
    if (!slug || !serviceId || !startISO || !name || !phone) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const master = await getMasterBySlug(slug);
    if (!master) {
      return res.status(404).json({ error: 'Master not found' });
    }

    const u = new URL(`/items/${COLL_SERVICES}`, DIRECTUS_URL);
    u.searchParams.set('limit', '1');
    u.searchParams.set('filter[id][_eq]', String(serviceId));
    u.searchParams.set('filter[master_id][_eq]', String(master.id));
    const j = await dFetch(u.pathname + '?' + u.searchParams.toString());
    const service = (j.data && j.data[0]) || null;

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const start = DateTime.fromISO(startISO).toUTC();
    if (!start.isValid) {
      return res.status(400).json({ error: 'startISO invalid' });
    }
    const end = start.plus({ minutes: service.duration_min });

    // Создаём/находим клиента
    const q = new URL(`/items/${COLL_CLIENTS}`, DIRECTUS_URL);
    q.searchParams.set('limit', '1');
    q.searchParams.set('filter[master_id][_eq]', String(master.id));
    q.searchParams.set('filter[phone][_eq]', String(phone));
    const found = await dFetch(q.pathname + '?' + q.searchParams.toString());
    
    let c;
    if (found.data && found.data[0]) {
      const existing = found.data[0];
      await dFetch(`/items/${COLL_CLIENTS}/${existing.id}`, { 
        method: 'PATCH', 
        body: JSON.stringify({ name }) 
      });
      c = existing;
    } else {
      const created = await dFetch(`/items/${COLL_CLIENTS}`, { 
        method: 'POST', 
        body: JSON.stringify({ master_id: master.id, name, phone }) 
      });
      c = created.data;
    }

    // Вставляем бронь
    const created = await dFetch(`/items/${COLL_BOOKINGS}`, { 
      method: 'POST', 
      body: JSON.stringify({
        master_id: master.id,
        service_id: service.id,
        client_id: c.id,
        starts_at: start.toISO(),
        ends_at: end.toISO(),
        status: 'pending',
        source: 'public',
      }) 
    });
    const bookingId = created?.data?.id;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    res.status(200).json({ ok: true, booking_id: bookingId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
}
