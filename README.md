````md
# Zaply (MVP)

## Dev
1) Настрой БД и выполни миграции:
```bash
psql "$DATABASE_URL" -f db/migrations.sql
psql "$DATABASE_URL" -f db/seeds.sql
````

2. API:

```bash
cd apps/api && cp .env.example .env && npm i && npm run dev
```

3. Frontend:

```bash
cd apps/frontend && npm i && npm run dev
```

4. Онбординг: [http://localhost:5173/setup](http://localhost:5173/setup) (нужен SERVICH\_SIGNUP\_SECRET)
5. Публичная страница: [http://localhost:5173/u/anna](http://localhost:5173/u/anna)

## Prod (кратко)

* Собери фронт: `npm run build` (apps/frontend), отдай через Nginx.
* Запусти API и напоминания через PM2 (см. pm2/ecosystem.config.js).
* Прокинь `/api` через Nginx на `127.0.0.1:8787`.

```
```


