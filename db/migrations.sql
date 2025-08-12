-- Требуемые расширения
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- для уникальных значений при необходимости
CREATE EXTENSION IF NOT EXISTS btree_gist;    -- для EXCLUDE ограничений по времени

-- Мастера (владельцы лендинга)
CREATE TABLE IF NOT EXISTS masters (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  avatar_url   TEXT,
  bio          TEXT,
  instagram    TEXT,
  telegram     TEXT,
  whatsapp     TEXT,
  address      TEXT,
  timezone     TEXT NOT NULL DEFAULT 'Europe/Moscow',
  telegram_chat_id TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS masters_slug_idx ON masters(slug);

-- Услуги
CREATE TABLE IF NOT EXISTS services (
  id            BIGSERIAL PRIMARY KEY,
  master_id     BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  duration_min  INT  NOT NULL CHECK (duration_min > 0 AND duration_min <= 600),
  price         NUMERIC(10,2),
  description   TEXT,
  sort          INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS services_master_idx ON services(master_id);

-- Рабочие часы по дням недели (0=вс, 1=пн ... 6=сб как в JS)
CREATE TABLE IF NOT EXISTS working_hours (
  id          BIGSERIAL PRIMARY KEY,
  master_id   BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  weekday     SMALLINT NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  UNIQUE(master_id, weekday)
);
CREATE INDEX IF NOT EXISTS working_hours_master_idx ON working_hours(master_id);

-- Перерывы / исключения (нерабочие интервалы в абсолютном времени)
CREATE TABLE IF NOT EXISTS time_off (
  id         BIGSERIAL PRIMARY KEY,
  master_id  BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS time_off_master_range_idx ON time_off USING GIST (master_id, tstzrange(starts_at, ends_at, '[)'));

-- Клиенты
CREATE TABLE IF NOT EXISTS clients (
  id         BIGSERIAL PRIMARY KEY,
  master_id  BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT,
  tg         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(master_id, phone)
);
CREATE INDEX IF NOT EXISTS clients_master_idx ON clients(master_id);

-- Брони
CREATE TABLE IF NOT EXISTS bookings (
  id           BIGSERIAL PRIMARY KEY,
  master_id    BIGINT NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  service_id   BIGINT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  client_id    BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending','confirmed','cancelled')) DEFAULT 'pending',
  source       TEXT,  -- public / widget / manual / etc
  note         TEXT,
  reminded_24h BOOLEAN NOT NULL DEFAULT FALSE,
  reminded_3h  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Запрет пересечения активных броней одного мастера (pending+confirmed)
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    master_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending','confirmed'));

CREATE INDEX IF NOT EXISTS bookings_master_day_idx ON bookings(master_id, date_trunc('day', starts_at));


