const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- config ---------- */
const PORT = process.env.PORT || 8080;
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE = 'bis_session';
const SESSION_DAYS = 7;

// persistent random secret unless JWT_SECRET is supplied
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  const f = path.join(DATA_DIR, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'));
  SECRET = fs.readFileSync(f, 'utf8');
}

/* ---------- database ---------- */
const db = new DatabaseSync(path.join(DATA_DIR, 'blackink.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const q = {
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT id,name,email,role,created_at FROM users WHERE id = ?'),
  userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
  insertUser: db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)'),
  insertEnquiry: db.prepare('INSERT INTO enquiries (user_id,name,email,message) VALUES (?,?,?,?)'),
  myEnquiries: db.prepare('SELECT id,message,status,created_at FROM enquiries WHERE user_id = ? OR email = ? ORDER BY id DESC'),
  allEnquiries: db.prepare('SELECT * FROM enquiries ORDER BY id DESC'),
  allUsers: db.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY id DESC'),
  setStatus: db.prepare('UPDATE enquiries SET status = ? WHERE id = ?')
};

/* ---------- helpers ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s, max) => String(s ?? '').trim().slice(0, max);

function setSession(res, user) {
  const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: IS_PROD,
    maxAge: SESSION_DAYS * 864e5, path: '/'
  });
}
function currentUser(req) {
  const t = req.cookies[COOKIE];
  if (!t) return null;
  try { return q.userById.get(jwt.verify(t, SECRET).id) || null; } catch { return null; }
}
const attachUser = (req, _res, next) => { req.user = currentUser(req); next(); };
const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Please log in first.' });
const requireAdmin = (req, res, next) =>
  req.user && req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only.' });

// tiny in-memory rate limiter
function rateLimit(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip + req.path, now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });
    arr.push(now); hits.set(key, arr); next();
  };
}
// block cross-site form posts: JSON only
const jsonOnly = (req, res, next) =>
  req.is('application/json') ? next() : res.status(415).json({ error: 'JSON required.' });

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(attachUser);
app.use((_, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
  next();
});

/* --- auth --- */
app.post('/api/auth/signup', jsonOnly, rateLimit(8, 15 * 60e3), (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password ?? '');
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (q.userByEmail.get(email)) return res.status(409).json({ error: 'An account with this email already exists.' });

  const role = q.userCount.get().n === 0 ? 'admin' : 'user'; // first account is the admin
  const info = q.insertUser.run(name, email, bcrypt.hashSync(password, 11), role);
  const user = q.userById.get(Number(info.lastInsertRowid));
  setSession(res, user);
  res.status(201).json({ user });
});

app.post('/api/auth/login', jsonOnly, rateLimit(10, 15 * 60e3), (req, res) => {
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password ?? '');
  const row = q.userByEmail.get(email);
  if (!row || !bcrypt.compareSync(password, row.password_hash))
    return res.status(401).json({ error: 'Incorrect email or password.' });
  setSession(res, row);
  res.json({ user: q.userById.get(row.id) });
});

app.post('/api/auth/logout', (_req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));

/* --- enquiries --- */
app.post('/api/enquiries', jsonOnly, rateLimit(6, 10 * 60e3), (req, res) => {
  const name = clean(req.body.name, 80) || req.user?.name || '';
  const email = (clean(req.body.email, 160) || req.user?.email || '').toLowerCase();
  const message = clean(req.body.message, 2000);
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  q.insertEnquiry.run(req.user?.id ?? null, name, email, message);
  res.status(201).json({ ok: true });
});
app.get('/api/enquiries/mine', requireAuth, (req, res) =>
  res.json({ enquiries: q.myEnquiries.all(req.user.id, req.user.email) }));

/* --- admin --- */
app.get('/api/admin/enquiries', requireAuth, requireAdmin, (_req, res) => res.json({ enquiries: q.allEnquiries.all() }));
app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => res.json({ users: q.allUsers.all() }));
app.patch('/api/admin/enquiries/:id', jsonOnly, requireAuth, requireAdmin, (req, res) => {
  const status = ['new', 'contacted', 'closed'].includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'Invalid status.' });
  q.setStatus.run(status, Number(req.params.id));
  res.json({ ok: true });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

/* --- static site (only public folders; never data/ or server/) --- */
['assets', 'css', 'js'].forEach(d => app.use('/' + d, express.static(path.join(ROOT, d), { maxAge: IS_PROD ? '7d' : 0 })));
['index', 'login', 'signup', 'account'].forEach(p =>
  app.get(p === 'index' ? ['/', '/index.html'] : [`/${p}`, `/${p}.html`], (_req, res) => res.sendFile(path.join(ROOT, `${p}.html`))));
app.use((_req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => console.log(`Black Ink Studios running at http://localhost:${PORT}`));
