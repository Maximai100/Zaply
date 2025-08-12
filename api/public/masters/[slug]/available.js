import { DateTime, Interval } from 'luxon';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://1.cycloscope.online';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFhMTc2MWNkLWNlZjktNGE1ZC05OTcxLTU1MzhmNzU3NDM0OCIsInJvbGU6ImVhNjI0NzcwLTlkMjAtNDU2My05ODkzLTYwMDZlNGE3NmNmYSIsImFwcF9hY2Nlc3MiOnRydWUsImFkbWluX2FjY2VzcyI6dHJ1ZSwiaWF0IjoxNzU0NDAxMDcyLCJleHAiOjE4MTc0NzMwNzIsImlzcyI6ImRpcmVjdHVzIn0.vJk2OE7gYRe5cYyhHcu5UwOdRqJdn2cRpuYzsAGTHI0';
const COLL_MASTERS = process.env.DIRECTUS_COLL_MASTERS || 'zaply_masters';
const COLL_SERVICES = process.env.DIRECTUS_COLL_SERVICES || 'zaply_services';
const COLL_WORKING_HOURS = process.env.DIRECTUS_COLL_WORKING_HOURS || 'zaply_working_hours';
const COLL_TIME_OFF = process.env.DIRECTUS_COLL_TIME_OFF || 'zaply_time_off';
const COLL_BOOKINGS = process.env.DIRECTUS_COLL_BOOKINGS || 'zaply_bookings';
const DEFAULT_TZ = 'Europe/Moscow';
const BOOKING_BUFFER_MIN = 60;

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

function dtFromParts(dateStr, timeStr, tz) {
  const [h, m, s] = (timeStr || '00:00:00').split(':').map(Number);
  return DateTime.fromISO(dateStr, { zone: tz }).set({ hour: h || 0, minute: m || 0, second: s || 0, millisecond: 0 });
}

function intervalsSubstract(baseIntervals, busyIntervals) {
  let free = [...baseIntervals];
  for (const b of busyIntervals) {
    const next = [];
    for (const f of free) {
      if (!f.overlaps(b)) { next.push(f); continue; }
      const inter = f.intersection(b);
      if (!inter) { next.push(f); continue; }
      const { start, end } = f;
      if (start < inter.start) next.push(Interval.fromDateTimes(start, inter.start));
      if (inter.end < end) next.push(Interval.fromDateTimes(inter.end, end));
    }
    free = next.filter(x => x.isValid && x.length('minutes') > 0);
  }
  return free;
}

function sliceIntervalsToSlots(freeIntervals, durationMin, stepMin = 5) {
  const slots = [];
  for (const f of freeIntervals) {
    let cursor = f.start;
    const end = f.end;
    while (cursor.plus({ minutes: durationMin }) <= end) {
      slots.push(cursor);
      cursor = cursor.plus({ minutes: stepMin });
    }
  }
  return slots;
}

async function loadDayData(masterId, dayStartUTC, dayEndUTC) {
  const qs = (o) => new URLSearchParams(o).toString();
  const whUrl = `/items/${COLL_WORKING_HOURS}?${qs({ 'filter[master_id][_eq]': String(masterId) })}`;
  const offsUrl = `/items/${COLL_TIME_OFF}?${qs({
    'filter[master_id][_eq]': String(masterId),
    'filter[starts_at][_lt]': dayEndUTC.toISO(),
    'filter[ends_at][_gt]': dayStartUTC.toISO(),
  })}`;
  const booksUrl = `/items/${COLL_BOOKINGS}?${qs({
    'filter[master_id][_eq]': String(masterId),
    'filter[status][_in]': 'pending,confirmed',
    'filter[starts_at][_lt]': dayEndUTC.toISO(),
    'filter[ends_at][_gt]': dayStartUTC.toISO(),
  })}`;
  const [whJ, offsJ, booksJ] = await Promise.all([
    dFetch(whUrl), dFetch(offsUrl), dFetch(booksUrl)
  ]);
  return { wh: whJ.data || [], offs: offsJ.data || [], books: booksJ.data || [] };
}

export default async function handler(req, res) {
  try {
    const { slug, serviceId, date } = req.query;
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!serviceId || !date) {
      return res.status(400).json({ error: 'serviceId and date are required' });
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

    const tz = master.timezone || DEFAULT_TZ;
    const dayStart = DateTime.fromISO(date, { zone: tz }).startOf('day');
    const dayEnd = dayStart.endOf('day');
    const notBefore = DateTime.utc().plus({ minutes: BOOKING_BUFFER_MIN });

    const { wh, offs, books } = await loadDayData(master.id, dayStart.toUTC(), dayEnd.toUTC());

    const jsWeekday = (dayStart.weekday === 7) ? 0 : dayStart.weekday;
    const workMatches = wh.filter(w => Number(w.weekday) === jsWeekday);

    const baseIntervals = workMatches.map(w => {
      const st = dtFromParts(date, w.start_time, tz);
      const en = dtFromParts(date, w.end_time, tz);
      return Interval.fromDateTimes(st.toUTC(), en.toUTC());
    }).filter(i => i.isValid && i.length('minutes') > 0);

    const asDT = (v) => (v instanceof Date ? DateTime.fromJSDate(v) : DateTime.fromISO(String(v)));
    const busy = [
      ...offs.map(o => Interval.fromDateTimes(asDT(o.starts_at), asDT(o.ends_at))),
      ...books.map(b => Interval.fromDateTimes(asDT(b.starts_at), asDT(b.ends_at)))
    ].filter(i => i.isValid && i.length('minutes') > 0);

    let free = intervalsSubstract(baseIntervals, busy);
    free = free.map(i => Interval.fromDateTimes(i.start < notBefore ? notBefore : i.start, i.end))
               .filter(i => i.isValid && i.length('minutes') >= service.duration_min);

    const slotStarts = sliceIntervalsToSlots(free, service.duration_min, 5);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    res.status(200).json({
      slots: slotStarts.map(dt => ({ start_utc: dt.toUTC().toISO() }))
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
}
