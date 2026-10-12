const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');

/* ---------- config ---------- */
const PORT = process.env.PORT || 8080;
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE = 'bis_session';
const SESSION_DAYS = 7;

if (!process.env.DATABASE_URL) {
  console.error('\nDATABASE_URL is not set.\nPut your Neon connection string in a .env file (see .env.example) or in the host\'s environment variables.\n');
  process.exit(1);
}

// persistent random secret unless JWT_SECRET is supplied (set JWT_SECRET on hosted servers)
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  const dir = path.join(ROOT, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'));
  SECRET = fs.readFileSync(f, 'utf8');
}

/* ---------- database (Postgres / Neon) ---------- */
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000 });
pool.on('error', err => console.error('Postgres pool error:', err.message));

const one = async (sql, params) => (await pool.query(sql, params)).rows[0] || null;
const many = async (sql, params) => (await pool.query(sql, params)).rows;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

const PUBLIC_USER = 'id, name, email, role, created_at';

/* ---------- helpers ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function setSession(res, user) {
  const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: IS_PROD,
    maxAge: SESSION_DAYS * 864e5, path: '/'
  });
}
async function currentUser(req) {
  const t = req.cookies[COOKIE];
  if (!t) return null;
  try {
    const { id } = jwt.verify(t, SECRET);
    return await one(`SELECT ${PUBLIC_USER} FROM users WHERE id = $1`, [id]);
  } catch { return null; }
}
const attachUser = wrap(async (req, _res, next) => { req.user = await currentUser(req); next(); });
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
if (IS_PROD) app.set('trust proxy', 1); // hosted behind a reverse proxy (Render, etc.)
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use((_, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
  next();
});
app.use('/api', attachUser); // only API calls hit the database for the session

/* --- auth --- */
app.post('/api/auth/signup', jsonOnly, rateLimit(8, 15 * 60e3), wrap(async (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password ?? '');
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (await one('SELECT 1 FROM users WHERE email = $1', [email])) return res.status(409).json({ error: 'An account with this email already exists.' });

  const { n } = await one('SELECT COUNT(*)::int AS n FROM users');
  const role = n === 0 ? 'admin' : 'user'; // first account is the admin
  let user;
  try {
    user = await one(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING ${PUBLIC_USER}`,
      [name, email, bcrypt.hashSync(password, 11), role]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    throw e;
  }
  setSession(res, user);
  res.status(201).json({ user });
}));

app.post('/api/auth/login', jsonOnly, rateLimit(10, 15 * 60e3), wrap(async (req, res) => {
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password ?? '');
  const row = await one('SELECT * FROM users WHERE email = $1', [email]);
  if (!row || !bcrypt.compareSync(password, row.password_hash))
    return res.status(401).json({ error: 'Incorrect email or password.' });
  setSession(res, row);
  res.json({ user: await one(`SELECT ${PUBLIC_USER} FROM users WHERE id = $1`, [row.id]) });
}));

app.post('/api/auth/logout', (_req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));

/* --- enquiries --- */
app.post('/api/enquiries', jsonOnly, rateLimit(6, 10 * 60e3), wrap(async (req, res) => {
  const name = clean(req.body.name, 80) || req.user?.name || '';
  const email = (clean(req.body.email, 160) || req.user?.email || '').toLowerCase();
  const message = clean(req.body.message, 2000);
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  await pool.query('INSERT INTO enquiries (user_id, name, email, message) VALUES ($1,$2,$3,$4)',
    [req.user?.id ?? null, name, email, message]);
  res.status(201).json({ ok: true });
}));
app.get('/api/enquiries/mine', requireAuth, wrap(async (req, res) =>
  res.json({ enquiries: await many(
    'SELECT id, message, status, created_at FROM enquiries WHERE user_id = $1 OR email = $2 ORDER BY id DESC',
    [req.user.id, req.user.email]) })));

/* --- contact us: logged-in users email the studio --- */
const CONTACT_TO = process.env.CONTACT_TO || 'shivambisht7376@gmail.com';

async function sendContactEmail({ user, subject, message }) {
  const text = `New message from the Black Ink Studios website\n\nFrom: ${user.name} <${user.email}>\nSubject: ${subject}\n\n${message}\n`;
  const mailSubject = `[Black Ink Studios] ${subject}`;

  if (process.env.RESEND_API_KEY) { // HTTPS email API: works on hosts that block SMTP (e.g. Render free)
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Black Ink Studios <onboarding@resend.dev>',
        to: [CONTACT_TO], reply_to: user.email, subject: mailSubject, text
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return true;
  }
  if (process.env.SMTP_USER && process.env.SMTP_PASS) { // Gmail app password
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await transport.sendMail({ from: `"Black Ink Studios" <${process.env.SMTP_USER}>`, to: CONTACT_TO, replyTo: user.email, subject: mailSubject, text });
    return true;
  }
  return false; // email not configured: the message is still saved for the admin
}

app.post('/api/contact', jsonOnly, requireAuth, rateLimit(5, 10 * 60e3), wrap(async (req, res) => {
  const subject = clean(req.body.subject, 120).replace(/[\r\n]+/g, ' ');
  const message = clean(req.body.message, 4000);
  if (subject.length < 3) return res.status(400).json({ error: 'Please enter a subject.' });
  if (message.length < 10) return res.status(400).json({ error: 'Please write a little more (at least 10 characters).' });
  await pool.query('INSERT INTO enquiries (user_id, name, email, message) VALUES ($1,$2,$3,$4)',
    [req.user.id, req.user.name, req.user.email, `[${subject}] ${message}`]);
  let emailed = false;
  try { emailed = await sendContactEmail({ user: req.user, subject, message }); }
  catch (e) { console.error('Contact email failed:', e.message); }
  res.status(201).json({ ok: true, emailed });
}));

/* --- admin --- */
app.get('/api/admin/enquiries', requireAuth, requireAdmin, wrap(async (_req, res) =>
  res.json({ enquiries: await many('SELECT * FROM enquiries ORDER BY id DESC') })));
app.get('/api/admin/users', requireAuth, requireAdmin, wrap(async (_req, res) =>
  res.json({ users: await many(`SELECT ${PUBLIC_USER} FROM users ORDER BY id DESC`) })));
app.patch('/api/admin/enquiries/:id', jsonOnly, requireAuth, requireAdmin, wrap(async (req, res) => {
  const status = ['new', 'contacted', 'closed'].includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: 'Invalid status.' });
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id.' });
  await pool.query('UPDATE enquiries SET status = $1 WHERE id = $2', [status, id]);
  res.json({ ok: true });
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

/* --- static site (only public folders; never data/ or server/) --- */
['robots.txt', 'sitemap.xml'].forEach(f => app.get('/' + f, (_req, res) => res.sendFile(path.join(ROOT, f))));
['assets', 'css', 'js'].forEach(d => app.use('/' + d, express.static(path.join(ROOT, d), { maxAge: IS_PROD ? '7d' : 0 })));
['index', 'login', 'signup', 'account', 'contact', 'about', 'careers'].forEach(p =>
  app.get(p === 'index' ? ['/', '/index.html'] : [`/${p}`, `/${p}.html`], (_req, res) => res.sendFile(path.join(ROOT, `${p}.html`))));
app.use((_req, res) => res.status(404).send('Not found'));

// central error handler: never leak internals
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error. Please try again.' });
});

/* ---------- start ---------- */
const start = async () => {
  await initDb();
  app.listen(PORT, () => console.log(`Black Ink Studios running at http://localhost:${PORT}`));
};
if (require.main === module) start().catch(e => { console.error('Failed to start:', e.message); process.exit(1); });
module.exports = { app, initDb, pool };
