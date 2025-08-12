import 'dotenv/config';
import pkg from 'pg';
import { DateTime } from 'luxon';

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function sendTG(chatId, text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (e) { console.warn('tg fail', e.message); }
}

async function run() {
  const now = DateTime.utc();
  const windows = [
    { col: 'reminded_24h', label: 'за 24 часа', diffMin: 24 * 60 },
    { col: 'reminded_3h',  label: 'за 3 часа',  diffMin: 3 * 60 }
  ];

  for (const w of windows) {
    const from = now.plus({ minutes: w.diffMin });
    const to = from.plus({ minutes: 5 }); // окно 5 минут
    const { rows } = await pool.query(
      `SELECT b.id, b.starts_at, s.name AS service_name, m.timezone, m.telegram_chat_id
       FROM bookings b
       JOIN services s ON s.id=b.service_id
       JOIN masters m  ON m.id=b.master_id
       WHERE b.status IN ('pending','confirmed')
         AND b.${w.col}=FALSE
         AND b.starts_at >= $1 AND b.starts_at < $2`,
      [from.toISO(), to.toISO()]
    );

    for (const r of rows) {
      const startLocal = DateTime.fromJSDate(r.starts_at).setZone(r.timezone || 'Europe/Moscow').toFormat('dd.LL.yyyy HH:mm');
      await sendTG(r.telegram_chat_id || process.env.DEFAULT_TELEGRAM_CHAT_ID, `Напоминание ${w.label}: ${r.service_name} ${startLocal}`);
      await pool.query(`UPDATE bookings SET ${w.col}=TRUE WHERE id=$1`, [r.id]);
    }
  }

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });


