import React from 'react';
import { Link } from 'react-router-dom';

export default function App() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Zaply</h1>
      <p className="mt-2 text-gray-600">Супер‑простой лендинг с записью для бьюти‑мастеров.</p>
      <div className="mt-6 flex gap-4">
        <Link className="px-4 py-2 rounded-xl bg-black text-white" to="/setup">Создать лендинг (онбординг)</Link>
        <Link className="px-4 py-2 rounded-xl bg-gray-100" to="/u/anna">Пример</Link>
      </div>
    </div>
  );
}


