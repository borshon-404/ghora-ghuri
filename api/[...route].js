/* =============================================================================
   GHORA GHURI - Production Serverless API & Headless CMS Engine
   Powered by Vercel Edge Config + GitHub GitOps Fallback + In-Memory Caching
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const DATA_DIR = path.resolve(__dirname, '../data');
const ADMIN_USER = process.env.ADMIN_USER || 'ghora-admin';
const ADMIN_HASH = process.env.ADMIN_HASH || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'ghora-ghuri-secret-key-2026';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID || '';
const EDGE_CONFIG_TOKEN = process.env.EDGE_CONFIG_TOKEN || '';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
const GITHUB_PAT = process.env.GITHUB_PAT || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'borshon-404/ghora-ghuri';

const memoryCache = new Map();

function sign(payloadMs) {
  const body = String(payloadMs);
  return Buffer.from(body).toString('base64url') + '.' + crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
}

function issueToken() {
  return sign(Date.now() + 8 * 3600 * 1000);
}

function checkAuth(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t || !t.includes('.')) return false;
  const [p, s] = t.split('.');
  try {
    const exp = Number(Buffer.from(p, 'base64url').toString());
    if (!exp || exp < Date.now()) return false;
    const want = crypto.createHmac('sha256', SESSION_SECRET).update(String(exp)).digest('base64url');
    return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want));
  } catch (e) {
    return false;
  }
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function fetchHttps(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Read entity with multi-tier storage: memory -> Edge Config -> local disk
async function getEntity(key, fallbackFileName) {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  if (EDGE_CONFIG_ID && EDGE_CONFIG_TOKEN) {
    try {
      const url = `https://edge-config.vercel.com/${EDGE_CONFIG_ID}/item/${key}?token=${EDGE_CONFIG_TOKEN}`;
      const res = await fetchHttps(url);
      if (res.status === 200 && res.body) {
        const parsed = JSON.parse(res.body);
        if (parsed !== undefined && parsed !== null) {
          memoryCache.set(key, parsed);
          return parsed;
        }
      }
    } catch (e) {
      console.warn(`Edge Config read error for ${key}:`, e.message);
    }
  }
  // Disk fallback
  try {
    const p = path.join(DATA_DIR, fallbackFileName);
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      memoryCache.set(key, parsed);
      return parsed;
    }
  } catch (e) {
    console.warn(`Local disk read error for ${fallbackFileName}:`, e.message);
  }
  return null;
}

// Persist entity to Edge Config and trigger GitHub sync asynchronously
async function setEntity(key, val, fileName = null) {
  memoryCache.set(key, val);

  // 1. Edge Config immediate update (< 500ms global replication)
  if (EDGE_CONFIG_ID && VERCEL_TOKEN) {
    try {
      const patchUrl = `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items`;
      const patchBody = JSON.stringify({
        items: [
          { operation: 'upsert', key: key, value: val }
        ]
      });
      const res = await fetchHttps(patchUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }, patchBody);
      if (res.status >= 300) {
        console.error(`Edge config patch returned ${res.status}:`, res.body);
      }
    } catch (e) {
      console.error('Edge config patch failed:', e);
    }
  }

  // 2. GitHub file commit for permanent source-of-truth version control
  if (fileName && GITHUB_PAT && GITHUB_REPO) {
    (async () => {
      try {
        const ghPath = `data/${fileName}`;
        const getUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${ghPath}`;
        let sha = null;
        const getRes = await fetchHttps(getUrl, {
          headers: {
            'Authorization': `Bearer ${GITHUB_PAT}`,
            'User-Agent': 'GhoraGhuri-CMS',
            'Accept': 'application/vnd.github+json'
          }
        });
        if (getRes.status === 200) {
          const info = JSON.parse(getRes.body);
          sha = info.sha;
        }
        const contentStr = JSON.stringify(val, null, 2);
        const putBody = JSON.stringify({
          message: `cms: update ${fileName} via Admin Dashboard`,
          content: Buffer.from(contentStr).toString('base64'),
          sha: sha || undefined,
          branch: 'main'
        });
        await fetchHttps(getUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${GITHUB_PAT}`,
            'User-Agent': 'GhoraGhuri-CMS',
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github+json'
          }
        }, putBody);
      } catch (err) {
        console.error(`GitHub commit failed for ${fileName}:`, err.message);
      }
    })();
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
async function calculatePrice(b) {
  const pkgRows = (await getEntity('packages', 'packages.json')) || [];
  const dstRows = (await getEntity('destinations', 'destinations.json')) || [];
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const urlObj = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  let pathname = urlObj.pathname;
  if (pathname.endsWith('/') && pathname.length > 1) pathname = pathname.slice(0, -1);

  // Health
  if (pathname === '/api/health') {
    return res.status(200).json({
      ok: true,
      runtime: 'vercel-serverless',
      storage: 'edge-config-connected',
      at: new Date().toISOString()
    });
  }

  // Auth: Login
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const b = req.body || {};
    const given = sha256(`${b.user || ''}:${b.pass || ''}`);
    const want = ADMIN_HASH || sha256(`${ADMIN_USER}:ChangeMe!2026`);
    if (b.user !== ADMIN_USER || given !== want) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    return res.status(200).json({
      token: issueToken(),
      role: 'admin',
      user: ADMIN_USER,
      expires_in: 8 * 3600
    });
  }

  // ------------------------------------------------------------- Destinations
  if (pathname === '/api/destinations') {
    if (req.method === 'GET') {
      const data = await getEntity('destinations', 'destinations.json');
      return res.status(200).json(data || []);
    }
    if (req.method === 'PUT') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
      const rows = req.body;
      if (!Array.isArray(rows)) return res.status(422).json({ error: 'expected array' });
      await setEntity('destinations', rows, 'destinations.json');
      return res.status(200).json({ ok: true, written: rows.length });
    }
  }

  // ----------------------------------------------------------------- Packages
  if (pathname === '/api/packages') {
    if (req.method === 'GET') {
      const data = await getEntity('packages', 'packages.json');
      return res.status(200).json(data || []);
    }
    if (req.method === 'PUT') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
      const rows = req.body;
      if (!Array.isArray(rows)) return res.status(422).json({ error: 'expected array' });
      await setEntity('packages', rows, 'packages.json');
      return res.status(200).json({ ok: true, written: rows.length });
    }
  }

  // --------------------------------------------------------------------- Blog
  if (pathname === '/api/blog') {
    if (req.method === 'GET') {
      const data = await getEntity('blog', 'blog.json');
      return res.status(200).json(data || []);
    }
    if (req.method === 'PUT') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
      const rows = req.body;
      if (!Array.isArray(rows)) return res.status(422).json({ error: 'expected array' });
      await setEntity('blog', rows, 'blog.json');
      return res.status(200).json({ ok: true, written: rows.length });
    }
  }

  // --------------------------------------------------------------- Pages CMS
  if (pathname === '/api/pages') {
    if (req.method === 'GET') {
      const data = await getEntity('pages', 'pages.json');
      return res.status(200).json(data || {});
    }
    if (req.method === 'PUT') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
      const val = req.body || {};
      await setEntity('pages', val, 'pages.json');
      return res.status(200).json({ ok: true, pages: val });
    }
  }

  // ----------------------------------------------------------- Portfolio Works
  if (pathname === '/api/portfolio') {
    if (req.method === 'GET') {
      const data = await getEntity('portfolio', 'portfolio.json');
      return res.status(200).json(data || []);
    }
    if (req.method === 'PUT') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
      const val = req.body;
      if (!Array.isArray(val)) return res.status(422).json({ error: 'expected array' });
      await setEntity('portfolio', val, 'portfolio.json');
      return res.status(200).json({ ok: true, portfolio: val });
    }
  }

  // ------------------------------------------------------------ Site Settings
  if (pathname === '/api/settings') {
    if (req.method === 'GET') {
      const settings = (await getEntity('settings', null)) || {
        name: 'GHORA GHURI',
        tagline: 'Tour & Travel Agency',
        owner: 'MASHZIDUL TANUN BORSHON',
        email: 'info.borshon@gmail.com',
        phone: '+8801330132141',
        whatsapp: '8801330132141',
        address: 'Daulatpur, Khulna, Bangladesh',
        founded: '2024',
        currency: 'BDT',
        gaMeasurementId: 'G-XXXXXXXXXX'
      };
      return res.status(200).json(settings);
    }
    if (req.method === 'PUT') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
      const val = req.body || {};
      await setEntity('settings', val, null);
      return res.status(200).json({ ok: true, settings: val });
    }
  }

  // ----------------------------------------------------------------- Bookings
  if (pathname === '/api/bookings') {
    if (req.method === 'GET') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
      const list = (await getEntity('bookings', null)) || [];
      return res.status(200).json(list);
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const errs = validateBooking(b);
      if (errs.honeypot) return res.status(200).json({ ok: true, note: 'accepted' });
      if (Object.keys(errs).length) return res.status(422).json({ ok: false, errors: errs });
      const id = b.id || bookingId();
      const q = await calculatePrice(b);
      const rec = {
        id,
        at: new Date().toISOString(),
        status: 'new',
        quote: q,
        details: sanitize(b)
      };
      const list = (await getEntity('bookings', null)) || [];
      list.unshift(rec);
      await setEntity('bookings', list.slice(0, 4000), null);
      return res.status(201).json({ ok: true, id, quote: q });
    }
  }

  // --------------------------------------------------- Contact Messages Inbox
  if (pathname === '/api/messages') {
    if (req.method === 'GET') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
      const list = (await getEntity('messages', null)) || [];
      return res.status(200).json(list);
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const errs = {};
      if (String(b.name || '').trim().length < 3) errs.name = 'too short';
      if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(String(b.email || ''))) errs.email = 'invalid';
      if (String(b.message || '').trim().length < 20) errs.message = 'too short';
      if (!b.consent) errs.consent = 'required';
      if (b._hp) return res.status(200).json({ ok: true });
      if (Object.keys(errs).length) return res.status(422).json({ ok: false, errors: errs });
      const list = (await getEntity('messages', null)) || [];
      list.unshift({ at: new Date().toISOString(), data: sanitize(b) });
      await setEntity('messages', list.slice(0, 2000), null);
      return res.status(201).json({ ok: true });
    }
  }

  // ---------------------------------------------------- Newsletter Subscribers
  if (pathname === '/api/subscribers') {
    if (req.method === 'GET') {
      if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
      const list = (await getEntity('subscribers', null)) || [];
      return res.status(200).json(list);
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const list = (await getEntity('subscribers', null)) || [];
      const email = String(b.email || '').toLowerCase();
      if (/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email) && !list.some((r) => r.email === email)) {
        list.push({ email, at: new Date().toISOString(), lang: b.lang || 'en' });
        await setEntity('subscribers', list, null);
      }
      return res.status(201).json({ ok: true });
    }
  }

  // ------------------------------------------------- Single Entity Operations
  // e.g. PUT /api/destinations/:id
  const destMatch = pathname.match(/^\/api\/destinations\/([a-zA-Z0-9_-]+)$/);
  if (destMatch && req.method === 'PUT') {
    if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
    const id = destMatch[1];
    const item = req.body;
    const list = (await getEntity('destinations', 'destinations.json')) || [];
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], item);
    } else {
      list.unshift(item);
    }
    await setEntity('destinations', list, 'destinations.json');
    return res.status(200).json({ ok: true, item: list[idx >= 0 ? idx : 0] });
  }

  const pkgMatch = pathname.match(/^\/api\/packages\/([a-zA-Z0-9_-]+)$/);
  if (pkgMatch && req.method === 'PUT') {
    if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
    const id = pkgMatch[1];
    const item = req.body;
    const list = (await getEntity('packages', 'packages.json')) || [];
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], item);
    } else {
      list.unshift(item);
    }
    await setEntity('packages', list, 'packages.json');
    return res.status(200).json({ ok: true, item: list[idx >= 0 ? idx : 0] });
  }

  const blogMatch = pathname.match(/^\/api\/blog\/([a-zA-Z0-9_-]+)$/);
  if (blogMatch && req.method === 'PUT') {
    if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
    const id = blogMatch[1];
    const item = req.body;
    const list = (await getEntity('blog', 'blog.json')) || [];
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx], item);
    } else {
      list.unshift(item);
    }
    await setEntity('blog', list, 'blog.json');
    return res.status(200).json({ ok: true, item: list[idx >= 0 ? idx : 0] });
  }

  return res.status(404).json({ error: 'not found', path: pathname });
};
