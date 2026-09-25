/* =============================================================================
   GHORA GHURI - example booking API (Node 18+, zero dependencies)
   -----------------------------------------------------------------------------
   Endpoints
     GET  /api/health
     GET  /api/destinations          -> data/destinations.json
     GET  /api/packages              -> data/packages.json
     GET  /api/bookings              -> list (auth)        admin inbox
     POST /api/bookings              -> create enquiry      public form
     POST /api/messages              -> contact form        public form
     POST /api/subscribers           -> newsletter          public form
     PUT  /api/destinations          -> replace array (auth) admin panel
     PUT  /api/packages             -> replace array (auth) admin panel
     POST /api/admin/login           -> {token}             demo creds in .env

   Auth: Authorization: Bearer <token>. Tokens are HMAC-signed, 8 hours, held in memory.
   Validation mirrors the client rules, because the client's rules are a courtesy and the
   server's are the actual boundary.

   This is an EXAMPLE to copy into a real service, not a production package: it has no
   database, no rate limiting beyond a simple counter, no TLS (terminate TLS at nginx or
   your host) and no email transport (fill sendMail()).

   Run:  ADMIN_USER=ghora-admin ADMIN_HASH=<sha256 hex of "user:pass"> \
         DATA_DIR=../data node api-example-node.js
   ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || '../data');
const ADMIN_USER = process.env.ADMIN_USER || 'ghora-admin';
const ADMIN_HASH = process.env.ADMIN_HASH || '';           // sha256 hex of `${user}:${pass}`
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '';       // e.g. https://ghoraghuri.com
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '';
const MAX_BODY = 256 * 1024;

const tokens = new Map();                                   // token -> expiry ms
const hits = new Map();                                     // ip -> [count, windowStart]

const now = () => Date.now();
const b64u = (b) => Buffer.from(b).toString('base64url');

function sign(payloadMs) {
  const body = String(payloadMs);
  return b64u(body) + '.' + crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
}
function issueToken() {
  const t = sign(now() + 8 * 3600 * 1000);
  tokens.set(t, now() + 8 * 3600 * 1000);
  return t;
}
function checkAuth(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const exp = tokens.get(t);
  if (!exp || exp < now()) { tokens.delete(t); return false; }
  const [p, s] = t.split('.');
  const want = crypto.createHmac('sha256', SESSION_SECRET).update(Buffer.from(p, 'base64url').toString()).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want));
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function rateLimited(ip, perMinutes, max) {
  const [c, start] = hits.get(ip) || [0, now()];
  if (now() - start > perMinutes * 60000) { hits.set(ip, [1, now()]); return false; }
  hits.set(ip, [c + 1, start]);
  return c + 1 > max;
}

function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); }
  catch (e) { return fallback; }
}
function writeJson(name, obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, '.' + name + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, path.join(DATA_DIR, name));
}

function send(res, code, obj, req) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  const headers = { 'Content-Type': typeof obj === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8' };
  if (ALLOW_ORIGIN) headers['Access-Control-Allow-Origin'] = ALLOW_ORIGIN;
  else headers['Access-Control-Allow-Origin'] = '*';       // development default
  headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
  headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,OPTIONS';
  headers['X-Content-Type-Options'] = 'nosniff';
  res.writeHead(code, headers);
  res.end(body);
}

/* --------------------------------------------------------------- validation */
const BD_PHONE = /^(\+?8801[3-9]\d{8}|01[3-9]\d{8})$/;
function validateBooking(b) {
  const e = {};
  if (!b || typeof b !== 'object') return { name: 'malformed body' };
  if (!String(b.name || '').trim() || String(b.name).trim().length < 3) e.name = 'name must be at least 3 characters';
  if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(String(b.email || ''))) e.email = 'invalid email';
  if (!BD_PHONE.test(String(b.phone || '').replace(/[\s\-()]/g, ''))) e.phone = 'phone must be a Bangladeshi mobile number';
  const ad = Number(b.people_adults) || 0, kids = Number(b.people_children) || 0;
  if (ad < 1 || ad > 60) e.people_adults = 'adults must be between 1 and 60';
  if (kids < 0 || kids > 40) e.people_children = 'invalid children count';
  const ds = String(b.date_start || ''), de = String(b.date_end || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) e.date_start = 'date_start must be YYYY-MM-DD';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de)) e.date_end = 'date_end must be YYYY-MM-DD';
  if (ds && de && de < ds) e.date_end = 'date_end is before date_start';
  if (ds && de && (new Date(de) - new Date(ds)) / 86400000 > 45) e.date_end = 'trip longer than 45 days';
  if (ds && new Date(ds) < new Date(Date.now() - 86400000)) e.date_start = 'date_start is in the past';
  if (!b.package && !b.destination) e.package = 'choose a package or a destination';
  if (!b.consent) e.consent = 'consent is required';
  if (b._hp) e.honeypot = 'bot field set';
  return e;
}

async function captchaScore(token) {
  if (!RECAPTCHA_SECRET) return { ok: true, note: 'recaptcha not configured' };
  if (!token || token === 'captcha-disabled') return { ok: false, score: 0 };
  const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'secret=' + encodeURIComponent(RECAPTCHA_SECRET) + '&response=' + encodeURIComponent(token)
  });
  const j = await r.json();
  return { ok: !!j.success && (j.score || 0) >= 0.5, score: j.score };
}

/* ------------------------------------------------------------ mail transport */
async function sendMail(to, subject, text) {
  /* Replace with nodemailer/SES/etc. Kept as a stub so the example has no dependencies. */
  console.log('[mail] -> %s | %s\n%s', to, subject, text.split('\n').slice(0, 6).join('\n'));
  return true;
}

/* -------------------------------------------------------------- id + pricing */
function bookingId() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rows = readJson('bookings.json', []);
  const n = rows.filter((r) => (r.id || '').indexOf('GG-' + ymd) === 0).length + 1;
  return 'GG-' + ymd + '-' + String(n).padStart(3, '0');
}
const GROUP_TIERS = [[12, 0.10], [6, 0.05]];
function price(b) {
  const pkgs = readJson('packages.json', []);
  const dests = readJson('destinations.json', []);
  const pkg = pkgs.find((p) => p.id === b.package);
  const dest = dests.find((x) => x.id === b.destination);
  const days = Math.max(1, Math.round((new Date(b.date_end) - new Date(b.date_start)) / 86400000) || (pkg ? pkg.duration_days : 2));
  let unit = pkg ? pkg.price_min : dest ? Math.round((dest.price_range_min + dest.price_range_max) / 2 / Math.max(1, dest.duration_days || 1)) : 3500;
  const adults = Number(b.people_adults) || 1, children = Number(b.people_children) || 0;
  const pax = adults + children;                    // whole heads: group tiers, seat counts
  const weight = adults + children * 0.7;           // children priced at 70%
  let sub = unit * days * weight;
  if (b.tour_type === 'private') sub *= 1.22;
  let disc = 0;
  GROUP_TIERS.forEach(([n, pct]) => { if (!disc && pax >= n) disc = pct; });
  return { total: Math.round(sub * (1 - disc)), discountPct: Math.round(disc * 100), days, head: pax, weight };
}

/* -------------------------------------------------------------------- router */
const server = http.createServer((req, res) => {
  const u = url.parse(req.url, true);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  if (u.pathname === '/api/health') return send(res, 200, { ok: true, data: fs.existsSync(DATA_DIR), at: new Date().toISOString() });

  if (u.pathname === '/api/destinations' && req.method === 'GET') return send(res, 200, readJson('destinations.json', []));
  if (u.pathname === '/api/packages' && req.method === 'GET') return send(res, 200, readJson('packages.json', []));

  if (u.pathname === '/api/admin/login' && req.method === 'POST') {
    if (rateLimited(ip, 10, 12)) return send(res, 429, { error: 'too many attempts' });
    return body(req, async (b) => {
      const given = sha256(`${b.user || ''}:${b.pass || ''}`);
      const want = ADMIN_HASH || sha256(`${ADMIN_USER}:ChangeMe!2026`);
      if (b.user !== ADMIN_USER || given !== want) return send(res, 401, { error: 'invalid credentials' });
      send(res, 200, { token: issueToken(), role: 'admin', expires_in: 8 * 3600 });
    });
  }

  if (u.pathname === '/api/bookings' && req.method === 'GET') {
    if (!checkAuth(req)) return send(res, 401, { error: 'unauthorized' });
    return send(res, 200, readJson('bookings.json', []));
  }
  if (u.pathname === '/api/bookings' && req.method === 'POST') {
    if (rateLimited(ip, 60, 20)) return send(res, 429, { error: 'please wait a minute and try again' });
    return body(req, async (b) => {
      const errs = validateBooking(b);
      if (errs.honeypot) return send(res, 200, { ok: true, note: 'accepted' });     // silently swallow bots
      if (Object.keys(errs).length) return send(res, 422, { ok: false, errors: errs });
      const cap = await captchaScore(b.captchaToken);
      if (!cap.ok) return send(res, 400, { ok: false, errors: { captcha: 'human check failed' } });
      const rows = readJson('bookings.json', []);
      const id = b.id || bookingId();
      const rec = {
        id, at: new Date().toISOString(), status: 'new', ip,
        quote: price(b), details: sanitize(b), captcha: cap.note || 'score ' + cap.score
      };
      rows.unshift(rec);
      writeJson('bookings.json', rows.slice(0, 4000));
      const summary = `Booking ${id}\n${rec.quote.head} pax (${Math.round(rec.quote.weight * 10) / 10} charged), ${rec.quote.days} days\n` +
        `${b.name} <${b.email}> ${b.phone}\nPackage: ${b.package || '-'} Destination: ${b.destination || '-'}\n` +
        `Dates: ${b.date_start} to ${b.date_end}\nEstimate: BDT ${rec.quote.total}\nRequests: ${String(b.requests || '').slice(0, 800)}`;
      await sendMail('bookings@ghoraghuri.example', `New booking request ${id}`, summary);
      send(res, 201, { ok: true, id, quote: rec.quote });
    });
  }
  if (u.pathname === '/api/messages' && req.method === 'POST') {
    if (rateLimited(ip, 60, 30)) return send(res, 429, { error: 'slow down' });
    return body(req, (b) => {
      const errs = {};
      if (String(b.name || '').trim().length < 3) errs.name = 'too short';
      if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(String(b.email || ''))) errs.email = 'invalid';
      if (String(b.message || '').trim().length < 20) errs.message = 'too short';
      if (!b.consent) errs.consent = 'required';
      if (b._hp) return send(res, 200, { ok: true });
      if (Object.keys(errs).length) return send(res, 422, { ok: false, errors: errs });
      const rows = readJson('messages.json', []);
      rows.unshift({ at: new Date().toISOString(), data: sanitize(b) });
      writeJson('messages.json', rows.slice(0, 2000));
      sendMail('office@ghoraghuri.example', `[web] ${b.topic || 'Message'} - ${b.name}`, b.message);
      send(res, 201, { ok: true });
    });
  }
  if (u.pathname === '/api/subscribers' && req.method === 'POST') {
    return body(req, (b) => {
      const rows = readJson('subscribers.json', []);
      const email = String(b.email || '').toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email) && !rows.some((r) => r.email === email)) {
        rows.push({ email, at: new Date().toISOString(), lang: b.lang || 'en' });
        writeJson('subscribers.json', rows);
      }
      send(res, 201, { ok: true });
    });
  }
  if ((u.pathname === '/api/destinations' || u.pathname === '/api/packages') && req.method === 'PUT') {
    if (!checkAuth(req)) return send(res, 401, { error: 'unauthorized' });
    const name = u.pathname.split('/').pop() + '.json';
    return body(req, (rows) => {
      if (!Array.isArray(rows)) return send(res, 422, { error: 'expected an array' });
      const bad = rows.filter((r) => !r.id || (!r.name && !r.title));
      if (bad.length) return send(res, 422, { error: 'records need id and name/title', count: bad.length });
      writeJson(name, rows);
      send(res, 200, { ok: true, written: rows.length });
    });
  }
  send(res, 404, { error: 'not found', path: u.pathname });
});

function body(req, cb) {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > MAX_BODY) { req.destroy(); } });
  req.on('end', () => {
    let parsed = {};
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { return send({ writeHead() { }, end() { } }, 400, { error: 'invalid JSON' }), cb.length && 0; } }
    try { cb(parsed, raw); } catch (e) { console.error(e); }
  });
}
/** strip control chars and cap field lengths before storage */
function sanitize(o) {
  const out = {};
  Object.keys(o).forEach((k) => {
    let v = o[k];
    if (typeof v === 'string') v = v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 2000);
    else if (Array.isArray(v)) v = v.slice(0, 40).map((x) => (typeof x === 'string' ? x.slice(0, 300) : x));
    out[k] = v;
  });
  return out;
}
server.listen(PORT, '0.0.0.0', () => console.log('GHORA GHURI API on http://0.0.0.0:' + PORT + ' (data: ' + DATA_DIR + ')'));
