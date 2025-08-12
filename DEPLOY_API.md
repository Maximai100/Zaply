# Развертывание API на сервере

## 1. Подготовка сервера

```bash
# Установи Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установи PM2
npm install -g pm2
```

## 2. Клонирование и настройка

```bash
# Клонируй репозиторий
git clone https://github.com/Maximai100/Zaply.git
cd Zaply/zaply

# Настрой API
cd apps/api
cp .env.example .env
```

## 3. Настройка .env

Отредактируй `apps/api/.env`:

```ini
# Directus
DIRECTUS_URL=https://1.cycloscope.online
DIRECTUS_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjFhMTc2MWNkLWNlZjktNGE1ZC05OTcxLTU1MzhmNzU3NDM0OCIsInJvbGU6ImVhNjI0NzcwLTlkMjAtNDU2My05ODkzLTYwMDZlNGE3NmNmYSIsImFwcF9hY2Nlc3MiOnRydWUsImFkbWluX2FjY2VzcyI6dHJ1ZSwiaWF0IjoxNzU0NDAxMDcyLCJleHAiOjE4MTc0NzMwNzIsImlzcyI6ImRpcmVjdHVzIn0.vJk2OE7gYRe5cYyhHcu5UwOdRqJdn2cRpuYzsAGTHI0

# Коллекции Directus
DIRECTUS_COLL_MASTERS=zaply_masters
DIRECTUS_COLL_SERVICES=zaply_services
DIRECTUS_COLL_WORKING_HOURS=zaply_working_hours
DIRECTUS_COLL_TIME_OFF=zaply_time_off
DIRECTUS_COLL_CLIENTS=zaply_clients
DIRECTUS_COLL_BOOKINGS=zaply_bookings

# API настройки
API_PORT=8787
DEFAULT_TZ=Europe/Moscow
BOOKING_BUFFER_MIN=60
SERVICH_SIGNUP_SECRET=change-me

# Telegram (опционально)
TELEGRAM_BOT_TOKEN=
DEFAULT_TELEGRAM_CHAT_ID=
```

## 4. Установка зависимостей и запуск

```bash
# Установи зависимости
npm ci

# Запусти через PM2
cd ../../
pm2 start pm2/ecosystem.config.js
pm2 save
pm2 startup
```

## 5. Настройка Nginx

Добавь в конфиг Nginx:

```nginx
# Проксирование API
location /api/ {
    proxy_pass http://127.0.0.1:8787/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

Перезагрузи Nginx:
```bash
sudo systemctl reload nginx
```

## 6. Проверка

```bash
# Проверь API
curl https://1.cycloscope.online/api/health
# Должен вернуть: {"ok":true}

# Проверь логи
pm2 logs zaply-api
```

## 7. Автообновление

```bash
# Создай скрипт для автообновления
cat > /root/update-zaply.sh << 'EOF'
#!/bin/bash
cd /root/Zaply/zaply
git pull
cd apps/api
npm ci
pm2 restart zaply-api
EOF

chmod +x /root/update-zaply.sh
```

## 8. Настройка Vercel

В Vercel Dashboard → Settings → Environment Variables:
- `VITE_API_URL` = `https://1.cycloscope.online/api`

Нажми Redeploy.
