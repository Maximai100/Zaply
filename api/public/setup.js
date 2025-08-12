const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://1.cycloscope.online';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFhMTc2MWNkLWNlZjktNGE1ZC05OTcxLTU1MzhmNzU3NDM0OCIsInJvbGU6ImVhNjI0NzcwLTlkMjAtNDU2My05ODkzLTYwMDZlNGE3NmNmYSIsImFwcF9hY2Nlc3MiOnRydWUsImFkbWluX2FjY2VzcyI6dHJ1ZSwiaWF0IjoxNzU0NDAxMDcyLCJleHAiOjE4MTc0NzMwNzIsImlzcyI6ImRpcmVjdHVzIn0.vJk2OE7gYRe5cYyhHcu5UwOdRqJdn2cRpuYzsAGTHI0';
const COLL_MASTERS = process.env.DIRECTUS_COLL_MASTERS || 'zaply_masters';
const COLL_SERVICES = process.env.DIRECTUS_COLL_SERVICES || 'zaply_services';
const COLL_WORKING_HOURS = process.env.DIRECTUS_COLL_WORKING_HOURS || 'zaply_working_hours';
const DEFAULT_TZ = 'Europe/Moscow';
const SERVICH_SIGNUP_SECRET = process.env.SERVICH_SIGNUP_SECRET || 'change-me';

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

    const { secret, master, services, working_hours } = req.body || {};
    if (!secret || secret !== SERVICH_SIGNUP_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!master?.name || !master?.slug) {
      return res.status(400).json({ error: 'master.name and master.slug are required' });
    }

    const created = await dFetch(`/items/${COLL_MASTERS}`, { 
      method: 'POST', 
      body: JSON.stringify({
        name: master.name,
        slug: master.slug.toLowerCase(),
        timezone: master.timezone || DEFAULT_TZ,
        telegram_chat_id: master.telegram_chat_id || null,
        bio: master.bio || null,
        instagram: master.instagram || null,
        telegram: master.telegram || null,
        whatsapp: master.whatsapp || null,
        address: master.address || null,
      }) 
    });
    const m = created.data;

    if (Array.isArray(services)) {
      for (const s of services) {
        if (!s.name || !s.duration_min) continue;
        await dFetch(`/items/${COLL_SERVICES}`, { 
          method: 'POST', 
          body: JSON.stringify({
            master_id: m.id, 
            name: s.name, 
            duration_min: Number(s.duration_min), 
            price: s.price || null, 
            description: s.description || null, 
            sort: s.sort || 0
          }) 
        });
      }
    }

    if (Array.isArray(working_hours)) {
      for (const w of working_hours) {
        if (w.weekday === undefined || !w.start_time || !w.end_time) continue;
        await dFetch(`/items/${COLL_WORKING_HOURS}`, { 
          method: 'POST', 
          body: JSON.stringify({
            master_id: m.id, 
            weekday: Number(w.weekday), 
            start_time: w.start_time, 
            end_time: w.end_time
          }) 
        });
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    res.status(200).json({ ok: true, master: m });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
}
