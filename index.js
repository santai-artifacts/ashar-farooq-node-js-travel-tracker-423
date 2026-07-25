import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const dbPath = process.env.DATABASE_URL || join(__dirname, 'data', 'app.db');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    destination   TEXT NOT NULL,
    country       TEXT NOT NULL,
    city          TEXT,
    start_date    TEXT,
    end_date      TEXT,
    notes         TEXT,
    rating        INTEGER DEFAULT 5,
    lat           REAL,
    lng           REAL,
    created_at    TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ── Trips ────────────────────────────────────────────────────────────────────

app.get('/api/trips', (_req, res) => {
  const trips = db.prepare('SELECT * FROM trips ORDER BY start_date DESC, created_at DESC').all();
  res.json(trips);
});

app.post('/api/trips', (req, res) => {
  const { destination, country, city, start_date, end_date, notes, rating, lat, lng } = req.body;
  if (!destination || !country) return res.status(400).json({ error: 'destination and country are required' });

  const stmt = db.prepare(`
    INSERT INTO trips (destination, country, city, start_date, end_date, notes, rating, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(destination, country, city ?? null, start_date ?? null, end_date ?? null, notes ?? null, rating ?? 5, lat ?? null, lng ?? null);

  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(trip);
});

app.put('/api/trips/:id', (req, res) => {
  const { destination, country, city, start_date, end_date, notes, rating, lat, lng } = req.body;
  if (!destination || !country) return res.status(400).json({ error: 'destination and country are required' });

  db.prepare(`
    UPDATE trips
    SET destination=?, country=?, city=?, start_date=?, end_date=?, notes=?, rating=?, lat=?, lng=?
    WHERE id=?
  `).run(destination, country, city ?? null, start_date ?? null, end_date ?? null, notes ?? null, rating ?? 5, lat ?? null, lng ?? null, req.params.id);

  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Not found' });
  res.json(trip);
});

app.delete('/api/trips/:id', (req, res) => {
  db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

app.get('/api/stats', (_req, res) => {
  const { total }    = db.prepare('SELECT COUNT(*) as total FROM trips').get();
  const { countries} = db.prepare('SELECT COUNT(DISTINCT country) as countries FROM trips').get();
  const { avg }      = db.prepare('SELECT AVG(rating) as avg FROM trips').get();
  const days = db.prepare(`
    SELECT SUM(
      CASE WHEN start_date IS NOT NULL AND end_date IS NOT NULL
           THEN (julianday(end_date) - julianday(start_date) + 1)
           ELSE 0 END
    ) as days FROM trips
  `).get();

  res.json({
    totalTrips: total,
    countries,
    avgRating: avg ? Math.round(avg * 10) / 10 : null,
    totalDays: days.days ?? 0,
  });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Travel Tracker → http://localhost:${PORT}`));
