import React, { useState } from 'react';
import { api } from '../lib/api.js';

export default function Setup() {
  const [secret, setSecret] = useState('');
  const [master, setMaster] = useState({ name: '', slug: '', timezone: 'Europe/Moscow', telegram_chat_id: '' });
  const [services, setServices] = useState([
    { name: '', duration_min: 60, price: '', description: '', sort: 1 },
  ]);
  const [wh, setWh] = useState([
    { weekday: 1, start_time: '10:00', end_time: '19:00' },
    { weekday: 2, start_time: '10:00', end_time: '19:00' },
    { weekday: 3, start_time: '10:00', end_time: '19:00' },
    { weekday: 4, start_time: '10:00', end_time: '19:00' },
    { weekday: 5, start_time: '10:00', end_time: '19:00' },
  ]);
  const [msg, setMsg] = useState('');

  function addService() { setServices(s => [...s, { name: '', duration_min: 60, price: '', description: '', sort: s.length+1 }]); }
  function rmService(i) { setServices(s => s.filter((_,idx)=>idx!==i)); }

  async function submit(e) {
    e.preventDefault(); setMsg('');
    try {
      const body = { secret, master, services: services.filter(s => s.name), working_hours: wh };
      const r = await api('/public/setup', { method: 'POST', body: JSON.stringify(body) });
      setMsg(`Готово! Перейди на /u/${r.master.slug}`);
    } catch (e) { setMsg(e.message); }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Онбординг мастера</h1>
      <p className="text-gray-600">Заполни минимум — страница будет готова.</p>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500">Секрет</label>
            <input value={secret} onChange={e=>setSecret(e.target.value)} className="mt-1 w-full border rounded-xl p-3" placeholder="Полученный секрет" />
          </div>
          <div>
            <label className="block text-sm text-gray-500">Часовой пояс</label>
            <input value={master.timezone} onChange={e=>setMaster({...master, timezone: e.target.value})} className="mt-1 w-full border rounded-xl p-3" placeholder="Europe/Moscow" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500">Имя мастера</label>
            <input value={master.name} onChange={e=>setMaster({...master, name: e.target.value})} className="mt-1 w-full border rounded-xl p-3" placeholder="Anna Beauty" />
          </div>
          <div>
            <label className="block text-sm text-gray-500">Слаг (ссылка)</label>
            <input value={master.slug} onChange={e=>setMaster({...master, slug: e.target.value.toLowerCase().replace(/\s+/g,'-')})} className="mt-1 w-full border rounded-xl p-3" placeholder="anna" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500">Telegram chat_id (для уведомлений)</label>
            <input value={master.telegram_chat_id} onChange={e=>setMaster({...master, telegram_chat_id: e.target.value})} className="mt-1 w-full border rounded-xl p-3" placeholder="123456789" />
          </div>
          <div>
            <label className="block text-sm text-gray-500">Instagram</label>
            <input value={master.instagram||''} onChange={e=>setMaster({...master, instagram: e.target.value})} className="mt-1 w-full border rounded-xl p-3" placeholder="@username" />
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-4">Услуги</h2>
          <div className="mt-2 space-y-3">
            {services.map((s, i) => (
              <div key={i} className="grid md:grid-cols-6 gap-2 items-end">
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-500">Название</label>
                  <input value={s.name} onChange={e=>{ const v=[...services]; v[i].name=e.target.value; setServices(v); }} className="mt-1 w-full border rounded-xl p-3" />
                </div>
                <div>
                  <label className="block text-sm text-gray-500">Мин</label>
                  <input type="number" value={s.duration_min} onChange={e=>{ const v=[...services]; v[i].duration_min=Number(e.target.value); setServices(v); }} className="mt-1 w-full border rounded-xl p-3" />
                </div>
                <div>
                  <label className="block text-sm text-gray-500">Цена</label>
                  <input value={s.price} onChange={e=>{ const v=[...services]; v[i].price=e.target.value; setServices(v); }} className="mt-1 w-full border rounded-xl p-3" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-500">Описание</label>
                  <input value={s.description} onChange={e=>{ const v=[...services]; v[i].description=e.target.value; setServices(v); }} className="mt-1 w-full border rounded-xl p-3" />
                </div>
                <div>
                  <button type="button" onClick={()=>rmService(i)} className="px-3 py-2 border rounded-xl">Удалить</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addService} className="px-4 py-2 rounded-xl bg-gray-100">+ Добавить услугу</button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-4">Рабочие часы (0=вс .. 6=сб)</h2>
          <div className="mt-2 space-y-2">
            {wh.map((w, i) => (
              <div key={i} className="grid md:grid-cols-4 gap-2">
                <input type="number" value={w.weekday} onChange={e=>{ const v=[...wh]; v[i].weekday=Number(e.target.value); setWh(v); }} className="border rounded-xl p-3" />
                <input value={w.start_time} onChange={e=>{ const v=[...wh]; v[i].start_time=e.target.value; setWh(v); }} className="border rounded-xl p-3" />
                <input value={w.end_time} onChange={e=>{ const v=[...wh]; v[i].end_time=e.target.value; setWh(v); }} className="border rounded-xl p-3" />
                <button type="button" onClick={()=>setWh(x=>x.filter((_,idx)=>idx!==i))} className="px-3 py-2 border rounded-xl">Удалить</button>
              </div>
            ))}
            <button type="button" onClick={()=>setWh(x=>[...x,{ weekday:0, start_time:'10:00', end_time:'19:00' }])} className="px-4 py-2 rounded-xl bg-gray-100">+ Добавить день</button>
          </div>
        </div>

        <button className="px-6 py-3 rounded-xl bg-black text-white">Опубликовать</button>
        {msg && <div className="text-sm mt-3">{msg}</div>}
      </form>
    </div>
  );
}


