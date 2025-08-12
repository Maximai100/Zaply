import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function PublicPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [slots, setSlots] = useState([]);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api(`/public/masters/${slug}`).then(setData).catch(e => setMsg(e.message));
  }, [slug]);

  const services = data?.services || [];

  useEffect(() => {
    if (!serviceId || !date) { setSlots([]); return; }
    api(`/public/masters/${slug}/available?serviceId=${serviceId}&date=${date}`)
      .then(r => setSlots(r.slots || []))
      .catch(e => setMsg(e.message));
  }, [slug, serviceId, date]);

  const master = data?.master;

  function fmtLocal(iso) {
    const d = new Date(iso);
    return d.toLocaleString([], { dateStyle: undefined, timeStyle: 'short' });
  }

  async function book(startISO) {
    setPending(true); setMsg('');
    try {
      await api('/public/bookings', {
        method: 'POST',
        body: JSON.stringify({ slug, serviceId, startISO, name: form.name, phone: form.phone })
      });
      setMsg('Готово! Мы отправили подтверждение мастеру.');
      setSlots([]);
    } catch (e) {
      setMsg(e.message);
    } finally { setPending(false); }
  }

  if (!data) return <div className="p-6">Загрузка… {msg && <div className="text-red-600 mt-2">{msg}</div>}</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="flex items-center gap-4">
        {master.avatar_url && <img src={master.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />}
        <div>
          <h1 className="text-2xl font-bold">{master.name}</h1>
          {master.bio && <p className="text-gray-600">{master.bio}</p>}
        </div>
      </header>

      <section className="mt-6">
        <label className="block text-sm text-gray-500">Выбери услугу</label>
        <select value={serviceId} onChange={e=>setServiceId(e.target.value)} className="mt-1 w-full border rounded-xl p-3">
          <option value="">—</option>
          {services.map(s => (
            <option key={s.id} value={s.id}>{s.name} · {s.price ? `${s.price}₽` : ''} · {s.duration_min} мин</option>
          ))}
        </select>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="md:col-span-1">
          <label className="block text-sm text-gray-500">Дата</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full border rounded-xl p-3" />

          <div className="mt-4">
            <label className="block text-sm text-gray-500">Имя</label>
            <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} className="mt-1 w-full border rounded-xl p-3" placeholder="Анна" />
          </div>
          <div className="mt-3">
            <label className="block text-sm text-gray-500">Телефон</label>
            <input value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} className="mt-1 w-full border rounded-xl p-3" placeholder="+7..." />
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="text-sm text-gray-500">Свободные слоты</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {slots.length === 0 && <div className="text-gray-400">Нет доступных слотов на выбранный день.</div>}
            {slots.map((s, i) => (
              <button key={i} disabled={pending || !form.name || !form.phone}
                onClick={()=>book(s.start_utc)}
                className="px-3 py-2 rounded-lg border hover:bg-black hover:text-white disabled:opacity-40">
                {fmtLocal(s.start_utc)}
              </button>
            ))}
          </div>
          {msg && <div className="mt-3 text-sm text-emerald-700">{msg}</div>}
        </div>
      </section>

      <footer className="mt-10 text-center text-xs text-gray-400">Сделано в Zaply</footer>
    </div>
  );
}


