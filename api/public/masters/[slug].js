import { DateTime, Interval } from 'luxon';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://1.cycloscope.online';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFhMTc2MWNkLWNlZjktNGE1ZC05OTcxLTU1MzhmNzU3NDM0OCIsInJvbGU6ImVhNjI0NzcwLTlkMjAtNDU2My05ODkzLTYwMDZlNGE3NmNmYSIsImFwcF9hY2Nlc3MiOnRydWUsImFkbWluX2FjY2VzcyI6dHJ1ZSwiaWF0IjoxNzU0NDAxMDcyLCJleHAiOjE4MTc0NzMwNzIsImlzcyI6ImRpcmVjdHVzIn0.vJk2OE7gYRe5cYyhHcu5UwOdRqJdn2cRpuYzsAGTHI0';
const COLL_MASTERS = process.env.DIRECTUS_COLL_MASTERS || 'zaply_masters';
const COLL_SERVICES = process.env.DIRECTUS_COLL_SERVICES || 'zaply_services';

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

async function getServices(masterId) {
  const u = new URL(`/items/${COLL_SERVICES}`, DIRECTUS_URL);
  u.searchParams.set('filter[master_id][_eq]', String(masterId));
  u.searchParams.set('sort', 'sort,id');
  const j = await dFetch(u.pathname + '?' + u.searchParams.toString());
  return j.data || [];
}

export default async function handler(req, res) {
  try {
    const { slug } = req.query;
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const master = await getMasterBySlug(slug);
    if (!master) {
      return res.status(404).json({ error: 'Master not found' });
    }
    
    const services = await getServices(master.id);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    res.status(200).json({ master, services });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
}
