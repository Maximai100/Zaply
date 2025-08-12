import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pkg from 'pg';
import { DateTime, Interval } from 'luxon';

const { Pool } = pkg;

const PORT = process.env.API_PORT || 8787;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DIRECTUS_URL = process.env.DIRECTUS_URL || '';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN || '';
// Позволяет задавать собственные имена коллекций в Directus, чтобы избежать конфликтов
const COLL_MASTERS = process.env.DIRECTUS_COLL_MASTERS || 'masters';
const COLL_SERVICES = process.env.DIRECTUS_COLL_SERVICES || 'services';
const COLL_WORKING_HOURS = process.env.DIRECTUS_COLL_WORKING_HOURS || 'working_hours';
const COLL_TIME_OFF = process.env.DIRECTUS_COLL_TIME_OFF || 'time_off';
const COLL_CLIENTS = process.env.DIRECTUS_COLL_CLIENTS || 'clients';
const COLL_BOOKINGS = process.env.DIRECTUS_COLL_BOOKINGS || 'bookings';
const USE_DIRECTUS = Boolean(DIRECTUS_URL && DIRECTUS_TOKEN);
const app = express();

app.use(cors());
app.use(express.json());

const DEFAULT_TZ = process.env.DEFAULT_TZ || 'Europe/Moscow';
const BOOKING_BUFFER_MIN = parseInt(process.env.BOOKING_BUFFER_MIN || '60', 10);

// Helpers
const sql = (strings, ...values) => ({ text: strings.join('$').replace(/\n\s+/g, ' ').trim(), values });

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
  if (!USE_DIRECTUS) {
    const { rows } = await pool.query('SELECT * FROM masters WHERE slug=$1', [slug]);
    return rows[0] || null;
  }
  const u = new URL(`/items/${COLL_MASTERS}`, DIRECTUS_URL);
  u.searchParams.set('limit', '1');
  u.searchParams.set('filter[slug][_eq]', String(slug));
  const j = await dFetch(u.pathname + '?' + u.searchParams.toString());
  return (j.data && j.data[0]) || null;
}

async function getServices(masterId) {
  if (!USE_DIRECTUS) {
    const { rows } = await pool.query('SELECT id, name, duration_min, price, description, sort FROM services WHERE master_id=$1 ORDER BY sort, id', [masterId]);
    return rows;
  }
  const u = new URL(`/items/${COLL_SERVICES}`, DIRECTUS_URL);
  u.searchParams.set('filter[master_id][_eq]', String(masterId));
  u.searchParams.set('sort', 'sort,id');
  const j = await dFetch(u.pathname + '?' + u.searchParams.toString());
  return j.data || [];
}

function dtFromParts(dateStr, timeStr, tz) {
  // dateStr: YYYY-MM-DD, timeStr: HH:mm:ss or HH:mm
  const [h, m, s] = (timeStr || '00:00:00').split(':').map(Number);
  return DateTime.fromISO(dateStr, { zone: tz }).set({ hour: h || 0, minute: m || 0, second: s || 0, millisecond: 0 });
}

function toUTC(dt) { return dt.toUTC(); }

function intervalsSubstract(baseIntervals, busyIntervals) {
  // baseIntervals: Interval[], busyIntervals: Interval[]
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
  if (!USE_DIRECTUS) {
    const { rows: wh } = await pool.query(
      'SELECT weekday, start_time, end_time FROM working_hours WHERE master_id=$1', [masterId]
    );
    const { rows: offs } = await pool.query(
      'SELECT starts_at, ends_at FROM time_off WHERE master_id=$1 AND tstzrange(starts_at, ends_at, "[)") && tstzrange($2, $3, "[)")',
      [masterId, dayStartUTC.toISO(), dayEndUTC.toISO()]
    );
    const { rows: books } = await pool.query(
      'SELECT starts_at, ends_at FROM bookings WHERE master_id=$1 AND status IN (\'pending\',\'confirmed\') AND tstzrange(starts_at, ends_at, "[)") && tstzrange($2, $3, "[)")',
      [masterId, dayStartUTC.toISO(), dayEndUTC.toISO()]
    );
    return { wh, offs, books };
  }
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

app.get('/health', (_req, res) => res.json({ ok: true }));

// Профиль мастера + услуги
app.get('/public/masters/:slug', async (req, res) => {
  try {
    const master = await getMasterBySlug(req.params.slug);
    if (!master) return res.status(404).json({ error: 'Master not found' });
    const services = await getServices(master.id);
    res.json({ master, services });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Server error' });
  }
});

// Доступные слоты на день
// /public/masters/:slug/available?serviceId=123&date=YYYY-MM-DD
app.get('/public/masters/:slug/available', async (req, res) => {
  try {
    const { slug } = req.params;
    const { serviceId, date } = req.query;
    if (!serviceId || !date) return res.status(400).json({ error: 'serviceId and date are required' });

    const master = await getMasterBySlug(slug);
    if (!master) return res.status(404).json({ error: 'Master not found' });

    let service;
    if (!USE_DIRECTUS) {
      const { rows: srows } = await pool.query('SELECT * FROM services WHERE id=$1 AND master_id=$2', [serviceId, master.id]);
      service = srows[0];
    } else {
      const u = new URL(`/items/${COLL_SERVICES}`, DIRECTUS_URL);
      u.searchParams.set('limit', '1');
      u.searchParams.set('filter[id][_eq]', String(serviceId));
      u.searchParams.set('filter[master_id][_eq]', String(master.id));
      const j = await dFetch(u.pathname + '?' + u.searchParams.toString());
      service = (j.data && j.data[0]) || null;
    }
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const tz = master.timezone || DEFAULT_TZ;

    const dayStart = DateTime.fromISO(date, { zone: tz }).startOf('day');
    const dayEnd = dayStart.endOf('day');

    // Граница «не раньше» (буфер)
    const notBefore = DateTime.utc().plus({ minutes: BOOKING_BUFFER_MIN });

    // Загружаем рабочий график/перерывы/бронь
    const { wh, offs, books } = await loadDayData(master.id, dayStart.toUTC(), dayEnd.toUTC());

    // Рабочие интервалы в этот день для данного weekday
    const weekday = dayStart.weekday % 7; // luxon: 1=пн..7=вс -> приведем к 0..6 (0=вс)
    // Преобразуем (luxon: Sunday=7) к нашей схеме (0=вс)
    const jsWeekday = (dayStart.weekday === 7) ? 0 : dayStart.weekday; // 1..6,0

    const workMatches = wh.filter(w => Number(w.weekday) === jsWeekday);

    const baseIntervals = workMatches.map(w => {
      const st = dtFromParts(date, w.start_time, tz);
      const en = dtFromParts(date, w.end_time, tz);
      return Interval.fromDateTimes(st.toUTC(), en.toUTC());
    }).filter(i => i.isValid && i.length('minutes') > 0);

    // Занятые интервалы = time_off + bookings
    const asDT = (v) => (v instanceof Date ? DateTime.fromJSDate(v) : DateTime.fromISO(String(v)));
    const busy = [
      ...offs.map(o => Interval.fromDateTimes(asDT(o.starts_at), asDT(o.ends_at))),
      ...books.map(b => Interval.fromDateTimes(asDT(b.starts_at), asDT(b.ends_at)))
    ].filter(i => i.isValid && i.length('minutes') > 0);

    // Свободные интервалы = рабочие минус занятые
    let free = intervalsSubstract(baseIntervals, busy);

    // Отсекаем интервалы до notBefore
    free = free.map(i => Interval.fromDateTimes(i.start < notBefore ? notBefore : i.start, i.end))
               .filter(i => i.isValid && i.length('minutes') >= service.duration_min);

    // Режем на слоты
    const slotStarts = sliceIntervalsToSlots(free, service.duration_min, 5);

    res.json({
      slots: slotStarts.map(dt => ({ start_utc: dt.toUTC().toISO() }))
    });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Server error' });
  }
});

// Создание брони
// body: { slug, serviceId, startISO, name, phone }
app.post('/public/bookings', async (req, res) => {
  const client = USE_DIRECTUS ? null : await pool.connect();
  try {
    const { slug, serviceId, startISO, name, phone } = req.body || {};
    if (!slug || !serviceId || !startISO || !name || !phone) return res.status(400).json({ error: 'Missing fields' });

    const master = await getMasterBySlug(slug);
    if (!master) return res.status(404).json({ error: 'Master not found' });

    let service;
    if (!USE_DIRECTUS) {
      const { rows: srows } = await pool.query('SELECT * FROM services WHERE id=$1 AND master_id=$2', [serviceId, master.id]);
      service = srows[0];
    } else {
      const u = new URL(`/items/${COLL_SERVICES}`, DIRECTUS_URL);
      u.searchParams.set('limit', '1');
      u.searchParams.set('filter[id][_eq]', String(serviceId));
      u.searchParams.set('filter[master_id][_eq]', String(master.id));
      const j = await dFetch(u.pathname + '?' + u.searchParams.toString());
      service = (j.data && j.data[0]) || null;
    }
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const start = DateTime.fromISO(startISO).toUTC();
    if (!start.isValid) return res.status(400).json({ error: 'startISO invalid' });
    const end = start.plus({ minutes: service.duration_min });

    if (!USE_DIRECTUS) await client.query('BEGIN');

    // Создаём/находим клиента
    let c;
    if (!USE_DIRECTUS) {
      const { rows: crows } = await client.query(
        'INSERT INTO clients (master_id, name, phone) VALUES ($1,$2,$3) ON CONFLICT (master_id, phone) DO UPDATE SET name=EXCLUDED.name RETURNING *',
        [master.id, name, phone]
      );
      c = crows[0];
    } else {
      // find or create client
      const q = new URL(`/items/${COLL_CLIENTS}`, DIRECTUS_URL);
      q.searchParams.set('limit', '1');
      q.searchParams.set('filter[master_id][_eq]', String(master.id));
      q.searchParams.set('filter[phone][_eq]', String(phone));
      const found = await dFetch(q.pathname + '?' + q.searchParams.toString());
      if (found.data && found.data[0]) {
        const existing = found.data[0];
        await dFetch(`/items/${COLL_CLIENTS}/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
        c = existing;
      } else {
        const created = await dFetch(`/items/${COLL_CLIENTS}`, { method: 'POST', body: JSON.stringify({ master_id: master.id, name, phone }) });
        c = created.data;
      }
    }

    // Вставляем бронь
    let bookingId;
    if (!USE_DIRECTUS) {
      const insertSql = `
        INSERT INTO bookings (master_id, service_id, client_id, starts_at, ends_at, status, source)
        VALUES ($1,$2,$3,$4,$5,'pending','public')
        RETURNING id
      `;
      const ins = await client.query(insertSql, [master.id, service.id, c.id, start.toISO(), end.toISO()]);
      bookingId = ins.rows[0].id;
    } else {
      const created = await dFetch(`/items/${COLL_BOOKINGS}`, { method: 'POST', body: JSON.stringify({
        master_id: master.id,
        service_id: service.id,
        client_id: c.id,
        starts_at: start.toISO(),
        ends_at: end.toISO(),
        status: 'pending',
        source: 'public',
      }) });
      bookingId = created?.data?.id;
    }

    if (!USE_DIRECTUS) await client.query('COMMIT');

    // Уведомим мастера в TG (если задан chat_id)
    if (process.env.TELEGRAM_BOT_TOKEN && (master.telegram_chat_id || process.env.DEFAULT_TELEGRAM_CHAT_ID)) {
      const chatId = master.telegram_chat_id || process.env.DEFAULT_TELEGRAM_CHAT_ID;
      const dateFmt = start.setZone(master.timezone || DEFAULT_TZ).toFormat('dd.LL.yyyy HH:mm');
      const text = `Новая запись!\n${service.name}\n${dateFmt}\n${name} ${phone}`;
      try {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text })
        });
      } catch (e) { console.warn('Telegram notify failed', e.message); }
    }

    res.json({ ok: true, booking_id: bookingId });
  } catch (e) {
    if (!USE_DIRECTUS && client) await client.query('ROLLBACK');
    if (e.code === '23P01') { // exclusion violation — пересечение броней
      return res.status(409).json({ error: 'Slot already taken' });
    }
    console.error(e); res.status(500).json({ error: 'Server error' });
  } finally {
    if (!USE_DIRECTUS && client) client.release();
  }
});

// Простой онбординг (создание мастера, услуг, рабочего графика)
// POST /public/setup  body: { secret, master: {name, slug, timezone, telegram_chat_id}, services: [...], working_hours: [...] }
app.post('/public/setup', async (req, res) => {
  const client = USE_DIRECTUS ? null : await pool.connect();
  try {
    const { secret, master, services, working_hours } = req.body || {};
    if (!secret || secret !== process.env.SERVICH_SIGNUP_SECRET) return res.status(403).json({ error: 'Forbidden' });
    if (!master?.name || !master?.slug) return res.status(400).json({ error: 'master.name and master.slug are required' });

    if (!USE_DIRECTUS) await client.query('BEGIN');

    let m;
    if (!USE_DIRECTUS) {
      const mIns = await client.query(
        'INSERT INTO masters (name, slug, timezone, telegram_chat_id, bio, instagram, telegram, whatsapp, address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
        [
          master.name,
          master.slug.toLowerCase(),
          master.timezone || DEFAULT_TZ,
          master.telegram_chat_id || null,
          master.bio || null,
          master.instagram || null,
          master.telegram || null,
          master.whatsapp || null,
          master.address || null,
        ]
      );
      m = mIns.rows[0];
    } else {
      const created = await dFetch(`/items/${COLL_MASTERS}`, { method: 'POST', body: JSON.stringify({
        name: master.name,
        slug: master.slug.toLowerCase(),
        timezone: master.timezone || DEFAULT_TZ,
        telegram_chat_id: master.telegram_chat_id || null,
        bio: master.bio || null,
        instagram: master.instagram || null,
        telegram: master.telegram || null,
        whatsapp: master.whatsapp || null,
        address: master.address || null,
      }) });
      m = created.data;
    }

    if (Array.isArray(services)) {
      for (const s of services) {
        if (!s.name || !s.duration_min) continue;
        if (!USE_DIRECTUS) {
          await client.query(
            'INSERT INTO services (master_id, name, duration_min, price, description, sort) VALUES ($1,$2,$3,$4,$5,$6)',
            [m.id, s.name, Number(s.duration_min), s.price || null, s.description || null, s.sort || 0]
          );
        } else {
          await dFetch(`/items/${COLL_SERVICES}`, { method: 'POST', body: JSON.stringify({
            master_id: m.id, name: s.name, duration_min: Number(s.duration_min), price: s.price || null, description: s.description || null, sort: s.sort || 0
          }) });
        }
      }
    }

    if (Array.isArray(working_hours)) {
      for (const w of working_hours) {
        if (w.weekday === undefined || !w.start_time || !w.end_time) continue;
        if (!USE_DIRECTUS) {
          await client.query(
            'INSERT INTO working_hours (master_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4) ON CONFLICT (master_id, weekday) DO UPDATE SET start_time=EXCLUDED.start_time, end_time=EXCLUDED.end_time',
            [m.id, Number(w.weekday), w.start_time, w.end_time]
          );
        } else {
          await dFetch(`/items/${COLL_WORKING_HOURS}`, { method: 'POST', body: JSON.stringify({
            master_id: m.id, weekday: Number(w.weekday), start_time: w.start_time, end_time: w.end_time
          }) });
        }
      }
    }

    if (!USE_DIRECTUS) await client.query('COMMIT');
    res.json({ ok: true, master: m });
  } catch (e) {
    if (!USE_DIRECTUS && client) await client.query('ROLLBACK');
    console.error(e); res.status(500).json({ error: 'Server error' });
  } finally {
    if (!USE_DIRECTUS && client) client.release();
  }
});

app.listen(PORT, () => {
  console.log(`ZAPLY API on :${PORT}`);
});


