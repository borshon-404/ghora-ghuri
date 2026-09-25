/* =============================================================================
   GHORA GHURI - Vercel Serverless API Gateway
   Handles /api/* endpoints on Vercel Node.js Serverless runtime.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.resolve(__dirname, '../data');
const ADMIN_USER = process.env.ADMIN_USER || 'ghora-admin';
const ADMIN_HASH = process.env.ADMIN_HASH || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'ghora-ghuri-secret-key-2026';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

const now = () => Date.now();
const b64u = (b) => Buffer.from(b).toString('base64url');

function sign(payloadMs) {
  const body = String(payloadMs);
  return b64u(body) + '.' + crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
}

function issueToken() {
  return sign(now() + 8 * 3600 * 1000);
}

function checkAuth(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t || !t.includes('.')) return false;
  const [p, s] = t.split('.');
  try {
    const exp = Number(Buffer.from(p, 'base64url').toString());
    if (!exp || exp < now()) return false;
    const want = crypto.createHmac('sha256', SESSION_SECRET).update(String(exp)).digest('base64url');
    return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want));
  } catch (e) {
    return false;
  }
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(name, obj) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const target = path.join(DATA_DIR, name);
    fs.writeFileSync(target, JSON.stringify(obj, null, 1));
  } catch (e) {
    // In serverless read-only filesystem, log if unable to write
    console.error('writeJson error:', e);
  }
}

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

const GROUP_TIERS = [[16, 0.15], [10, 0.10], [6, 0.05]];
function price(b) {
  const pkgRows = readJson('packages.json', []);
  const dstRows = readJson('destinations.json', []);
  let unit = 3200, days = 2;
  const p = pkgRows.find((x) => x.id === b.package);
  if (p) {
    unit = p.price_min || unit;
    days = p.duration_days || days;
  } else {
    const d = dstRows.find((x) => x.id === b.destination);
    if (d) {
      unit = d.price_range_min || unit;
      days = d.duration_days || days;
    }
  }
  const adults = Math.max(1, Number(b.people_adults) || 1);
  const children = Math.max(0, Number(b.people_children) || 0);
  const pax = adults + children;
  const weight = adults + children * 0.7;
  let sub = unit * days * weight;
  if (b.tour_type === 'private') sub *= 1.22;
  let disc = 0;
  GROUP_TIERS.forEach(([n, pct]) => { if (!disc && pax >= n) disc = pct; });
  return { total: Math.round(sub * (1 - disc)), discountPct: Math.round(disc * 100), days, head: pax, weight };
}

function bookingId() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const r = Math.floor(100 + Math.random() * 900);
  return `GG-${d}-${r}`;
}

function sanitize(o) {
  if (!o || typeof o !== 'object') return {};
  const out = {};
  Object.keys(o).forEach((k) => {
    let v = o[k];
    if (typeof v === 'string') v = v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 2000);
    else if (Array.isArray(v)) v = v.slice(0, 40).map((x) => (typeof x === 'string' ? x.slice(0, 300) : x));
    out[k] = v;
  });
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Parse path
  const urlObj = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  let pathname = urlObj.pathname;
  if (pathname.endsWith('/') && pathname.length > 1) pathname = pathname.slice(0, -1);

  if (pathname === '/api/health') {
    return res.status(200).json({ ok: true, runtime: 'vercel-serverless', at: new Date().toISOString() });
  }

  if (pathname === '/api/destinations' && req.method === 'GET') {
    return res.status(200).json(readJson('destinations.json', []));
  }

  if (pathname === '/api/packages' && req.method === 'GET') {
    return res.status(200).json(readJson('packages.json', []));
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const b = req.body || {};
    const given = sha256(`${b.user || ''}:${b.pass || ''}`);
    const want = ADMIN_HASH || sha256(`${ADMIN_USER}:ChangeMe!2026`);
    if (b.user !== ADMIN_USER || given !== want) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    return res.status(200).json({ token: issueToken(), role: 'admin', expires_in: 8 * 3600 });
  }

  if (pathname === '/api/bookings' && req.method === 'GET') {
    if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
    return res.status(200).json(readJson('bookings.json', []));
  }

  if (pathname === '/api/bookings' && req.method === 'POST') {
    const b = req.body || {};
    const errs = validateBooking(b);
    if (errs.honeypot) return res.status(200).json({ ok: true, note: 'accepted' });
    if (Object.keys(errs).length) return res.status(422).json({ ok: false, errors: errs });
    const id = b.id || bookingId();
    const q = price(b);
    const rec = {
      id, at: new Date().toISOString(), status: 'new',
      quote: q, details: sanitize(b)
    };
    const rows = readJson('bookings.json', []);
    rows.unshift(rec);
    writeJson('bookings.json', rows.slice(0, 4000));
    return res.status(201).json({ ok: true, id, quote: q });
  }

  if (pathname === '/api/messages' && req.method === 'POST') {
    const b = req.body || {};
    const errs = {};
    if (String(b.name || '').trim().length < 3) errs.name = 'too short';
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(String(b.email || ''))) errs.email = 'invalid';
    if (String(b.message || '').trim().length < 20) errs.message = 'too short';
    if (!b.consent) errs.consent = 'required';
    if (b._hp) return res.status(200).json({ ok: true });
    if (Object.keys(errs).length) return res.status(422).json({ ok: false, errors: errs });
    const rows = readJson('messages.json', []);
    rows.unshift({ at: new Date().toISOString(), data: sanitize(b) });
    writeJson('messages.json', rows.slice(0, 2000));
    return res.status(201).json({ ok: true });
  }

  if (pathname === '/api/subscribers' && req.method === 'POST') {
    const b = req.body || {};
    const rows = readJson('subscribers.json', []);
    const email = String(b.email || '').toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email) && !rows.some((r) => r.email === email)) {
      rows.push({ email, at: new Date().toISOString(), lang: b.lang || 'en' });
      writeJson('subscribers.json', rows);
    }
    return res.status(201).json({ ok: true });
  }

  if ((pathname === '/api/destinations' || pathname === '/api/packages') && req.method === 'PUT') {
    if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
    const name = pathname.split('/').pop() + '.json';
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(422).json({ error: 'expected an array' });
    const bad = rows.filter((r) => !r.id || (!r.name && !r.title));
    if (bad.length) return res.status(422).json({ error: 'records need id and name/title', count: bad.length });
    writeJson(name, rows);
    return res.status(200).json({ ok: true, written: rows.length });
  }

  return res.status(404).json({ error: 'not found', path: pathname });
};
