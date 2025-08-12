-- Демонстрационный мастер «Anna»
INSERT INTO masters (name, slug, bio, timezone) VALUES
('Anna Beauty', 'anna', 'Брови, ресницы, макияж. Онлайн‑запись ниже.', 'Europe/Moscow')
ON CONFLICT (slug) DO NOTHING;

-- Получим id мастера
WITH m AS (SELECT id FROM masters WHERE slug='anna')
INSERT INTO services (master_id, name, duration_min, price, description, sort)
SELECT id, 'Оформление бровей', 45, 1200, 'Коррекция + окрашивание', 1 FROM m
ON CONFLICT DO NOTHING;

WITH m AS (SELECT id FROM masters WHERE slug='anna')
INSERT INTO services (master_id, name, duration_min, price, description, sort)
SELECT id, 'Ламинирование ресниц', 60, 2000, 'Эффектный изгиб', 2 FROM m
ON CONFLICT DO NOTHING;

-- Работа пн‑пт 10:00–19:00
WITH m AS (SELECT id FROM masters WHERE slug='anna')
INSERT INTO working_hours (master_id, weekday, start_time, end_time)
SELECT id, wd, '10:00', '19:00' FROM m, LATERAL (VALUES (1),(2),(3),(4),(5)) AS w(wd)
ON CONFLICT DO NOTHING;


