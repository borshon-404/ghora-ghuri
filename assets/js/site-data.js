/* ==========================================================================
   GHORA GHURI - site-data.js
   Shared namespace: configuration, data loading, formatting, tiny DOM helpers.
   Loaded first on every page. No framework, no network call required for the
   single-file preview (window.GG_EMBED short-circuits all fetches).
   ========================================================================== */
(function (w, d) {
  'use strict';

  var html = d.documentElement;
  var GG = w.GG = w.GG || {};

  /* ---------------------------------------------------------------- config */
  GG.cfg = {
    name: 'GHORA GHURI',
    tagline: 'Tour & Travel Agency',
    owner: 'MASHZIDUL TANUN BORSHON',
    email: 'info.borshon@gmail.com',
    phone: '+8801330132141',
    phoneHref: '+8801330132141',
    whatsapp: '8801330132141',
    address: 'Daulatpur, Khulna, Bangladesh',
    geo: '22.8450,89.5500',
    founded: '2024',
    currency: 'BDT',
    locale: 'en-BD',
    mapEngine: 'leaflet',                 // 'leaflet' | 'google' | 'static'
    googleMapsKey: 'YOUR_GOOGLE_MAPS_JS_KEY',   // REPLACE before production
    recaptchaSiteKey: 'YOUR_RECAPTCHA_V3_SITE_KEY', // REPLACE
    formspreeEndpoint: 'https://formspree.io/f/YOUR_FORM_ID', // REPLACE
    gaMeasurementId: 'G-XXXXXXXXXX',      // REPLACE (GA4)
    fbPixelId: '000000000000000',         // REPLACE
    apiBase: window.location.origin,                            // e.g. 'https://api.example.com' when server-stubs are used
    socials: {
      facebook: 'https://facebook.com/ghoraghuri',
      instagram: 'https://instagram.com/ghoraghuri',
      youtube: 'https://youtube.com/@ghoraghuri',
      tiktok: 'https://tiktok.com/@ghoraghuri',
      linkedin: 'https://linkedin.com/company/ghoraghuri'
    }
  };

  /* ------------------------------------------------- path resolution helpers */
  GG.root = html.getAttribute('data-root') || '.';
  GG.embedded = !!w.GG_EMBED;
  GG.url = function (p) {
    if (!p) return GG.root;
    if (/^(https?:|data:|mailto:|tel:)/.test(p)) return p;
    return (GG.root.replace(/\/$/, '')) + '/' + String(p).replace(/^\.\//, '').replace(/^\/+/, '');
  };
  GG.href = GG.url;

  /* ------------------------------------------------------------ tiny DOM API */
  GG.$ = function (sel, ctx) { return (ctx || d).querySelector(sel); };
  GG.$$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || d).querySelectorAll(sel)); };
  GG.on = function (el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt); return el; };
  GG.attr = function (el, obj) { for (var k in obj) el.setAttribute(k, obj[k]); return el; };
  GG.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  GG.el = function (tag, cls, html) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  GG.param = function (key, fallback) {
    try {
      var m = new URLSearchParams(w.location.search);
      var v = m.get(key);
      return v == null ? (fallback == null ? '' : fallback) : v;
    } catch (e) { return fallback || ''; }
  };

  /* -------------------------------------------------------------- formatting */
  GG.fmt = {
    money: function (v) {
      var n = Number(v) || 0;
      try { return new Intl.NumberFormat(GG.cfg.locale, { style: 'currency', currency: GG.cfg.currency, maximumFractionDigits: 0 }).format(n); }
      catch (e) { return 'Tk ' + n.toLocaleString('en-US'); }
    },
    date: function (v) {
      if (!v) return '-';
      var dt = new Date(v);
      if (isNaN(dt)) return String(v);
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    },
    nights: function (n) { return n + (n === 1 ? ' day' : ' days'); },
    plural: function (n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  };

  /* ----------------------------------------------------------- poster (SVG) */
  var POSTER_COLORS = {
    beach: ['#0a6e8f', '#28b4c9'], heritage: ['#7a4b1e', '#c99a4b'], hill: ['#1c5c3f', '#4fa878'],
    wildlife: ['#2c5320', '#6fa84f'], eco: ['#155e4b', '#3fa382'], river: ['#14456b', '#3f88b5'],
    lake: ['#0f4c5c', '#3d9aa8'], city: ['#3b3b4a', '#7d7d92'], village: ['#5b4a24', '#a8914f'],
    island: ['#0b6a72', '#43c0c0'], default: ['#04583a', '#067a4f']
  };
  var posterCache = {};
  GG.poster = function (rec) {
    var key = rec && rec.id;
    if (posterCache[key]) return posterCache[key];
    var tag = (rec && rec.tags && rec.tags[0]) || 'default';
    var c = POSTER_COLORS[tag] || POSTER_COLORS.default;
    var label = GG.esc(((rec && rec.name) || 'GHORA GHURI').slice(0, 26));
    var sub = GG.esc((rec && rec.district ? rec.district + ' \u00b7 ' + rec.division : (rec && rec.division) || ''));
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img" aria-label="' + label + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient>' +
      '<linearGradient id="s" x1="0" y1="1" x2="0" y2="0">' +
      '<stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>' +
      '<rect width="800" height="500" fill="url(#g)"/>' +
      '<g fill="#ffffff" opacity=".14">' +
      '<circle cx="666" cy="92" r="46"/><path d="M0 402 L150 300 L270 392 L360 322 L470 410 L560 344 L690 430 L800 372 L800 500 L0 500Z"/>' +
      '<path d="M0 452 L160 372 L300 448 L420 388 L540 462 L700 402 L800 452 L800 500 L0 500Z" opacity=".5"/></g>' +
      '<rect width="800" height="500" fill="url(#s)"/>' +
      '<text x="46" y="268" font-family="Georgia,serif" font-size="42" fill="#ffffff">' + label + '</text>' +
      '<text x="46" y="308" font-family="sans-serif" font-size="20" fill="#ffffff" opacity=".8">' + sub + '</text>' +
      '<text x="46" y="452" font-family="sans-serif" font-size="15" letter-spacing="3" fill="#ffd97a">GHORA GHURI</text>' +
      '</svg>';
    var uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    posterCache[key] = uri;
    return uri;
  };

  /** Resolve an image for a destination record.
   *  Priority: locally shipped photo > remote placeholder > generated poster. */
  GG.img = function (rec, small) {
    if (!rec) return { src: GG.poster(rec), remote: '' };
    var emb = (w.GG_EMBED && w.GG_EMBED.images) || null;
    if (emb && emb[rec.id]) return { src: emb[rec.id], remote: rec.image_remote || '' };
    var local = small ? rec.image_thumb : rec.image;
    if (local) return { src: GG.url(local), remote: rec.image_remote || '' };
    return { src: GG.poster(rec), remote: rec.image_remote || '' };
  };

  /* ------------------------------------------------------------ data loading */
  var cache = {};
  var LITE = {                                   // file:// fallback dataset
    destinations: 'lite-destinations',
    packages: 'lite-packages'
  };
  GG.data = {
    /** kind: 'destinations' | 'packages' */
    load: function (kind) {
      if (cache[kind]) return Promise.resolve(cache[kind]);
      if (w.GG_EMBED && w.GG_EMBED[kind]) {
        cache[kind] = w.GG_EMBED[kind];
        return Promise.resolve(cache[kind]);
      }
      return w.fetch(GG.url('data/' + kind + '.json'), { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (rows) { cache[kind] = rows; return rows; })
        .catch(function (err) {
          var lite = w.__GG_LITE__ && w.__GG_LITE__[LITE[kind]];
          if (lite) {
            cache[kind] = lite;
            GG.warnOnce(kind, 'Served the built-in sample subset. Run a local server (see README) or open index.preview.html for the full database.');
            return lite;
          }
          throw err;
        });
    },
    put: function (kind, rows) { cache[kind] = rows; },
    all: function () {
      return Promise.all([GG.data.load('destinations'), GG.data.load('packages')
        .catch(function () { return []; })])
        .then(function (res) { return { destinations: res[0], packages: res[1] }; });
    }
  };
  GG.warnOnce = function (key, msg) {
    if (GG._warned && GG._warned[key]) return;
    GG._warned = GG._warned || {}; GG._warned[key] = 1;
    try { w.console && console.warn('[GHORA GHURI] ' + msg); } catch (e) { }
    var zone = GG.$('#js-notice');
    if (zone) { zone.hidden = false; zone.textContent = msg; }
  };

  /* ------------------------------------------------------------ toast notices */
  GG.toast = function (msg, kind) {
    var d = document;
    var zone = GG.$('#js-toasts');
    if (!zone) { zone = GG.el('div', 'toast-zone'); zone.id = 'js-toasts'; d.body.appendChild(zone); }
    var el = GG.el('div', 'toast', GG.esc(msg));
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    if (kind) el.setAttribute('data-kind', kind);
    zone.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 320); }, 4200);
    return el;
  };

  /* ------------------------------------------------------------ translations */
  GG.lang = {
    get: function () {
      try { return w.localStorage.getItem('gg.lang') || html.getAttribute('lang') || 'en'; }
      catch (e) { return 'en'; }
    },
    dict: {},
    load: function (lang) {
      if (w.GG_EMBED && w.GG_EMBED.translations && w.GG_EMBED.translations[lang]) {
        GG.lang.dict = w.GG_EMBED.translations[lang]; return Promise.resolve(GG.lang.dict);
      }
      return w.fetch(GG.url('data/translations/' + lang + '.json'))
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (j) { GG.lang.dict = j || {}; return GG.lang.dict; })
        .catch(function () { GG.lang.dict = {}; return {}; });
    },
    t: function (key, fallback) {
      var v = GG.lang.dict[key];
      if (v != null) return v;
      var node = d.querySelector('[data-i18n="' + key + '"]');
      if (node && node.textContent) return node.textContent.trim();
      return fallback != null ? fallback : key;
    },
    apply: function (lang) {
      html.setAttribute('lang', lang);
      GG.$$('[data-i18n]').forEach(function (n) {
        var k = n.getAttribute('data-i18n');
        if (GG.lang.dict[k] != null) n.textContent = GG.lang.dict[k];
      });
      GG.$$('[data-i18n-attr]').forEach(function (n) {
        n.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
          var bits = pair.split(':');
          var key = bits[1].trim(), attr = bits[0].trim();
          if (GG.lang.dict[key] != null) n.setAttribute(attr, GG.lang.dict[key]);
        });
      });
      GG.$$('[data-i18n-placeholder]').forEach(function (n) {
        var k = n.getAttribute('data-i18n-placeholder');
        if (GG.lang.dict[k] != null) n.setAttribute('placeholder', GG.lang.dict[k]);
      });
      try { w.localStorage.setItem('gg.lang', lang); } catch (e) { }
      GG.util.dispatch('gg:lang', { lang: lang });
    }
  };

  /* ------------------------------------------------------------ misc helpers */
  GG.util = {
    dispatch: function (name, detail) {
      try { d.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (e) { }
    },
    debounce: function (fn, ms) {
      var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms || 180); };
    },
    slug: function (s) {
      return String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    },
    /** deterministic pseudo-rating so demo cards look varied without a backend */
    ratingOf: function (rec) {
      if (rec && rec.rating) return rec.rating;
      var h = 0, s = (rec && rec.id) || '';
      for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000;
      return Math.round((4.1 + (h % 9) / 10) * 10) / 10;
    },
    reviewsOf: function (rec) {
      if (rec && rec.reviews) return rec.reviews;
      var h = 0, s = (rec && rec.id) || '';
      for (var i = 0; i < s.length; i++) h = (h * 17 + s.charCodeAt(i)) % 700;
      return 40 + h;
    },
    stars: function (n) {
      var full = Math.floor(n), half = (n - full) >= 0.5, out = '';
      for (var i = 0; i < full; i++) out += '★';
      if (half) out += '⯨';
      while (out.length < 5) out += '☆';
      return out;
    },
    dayLeft: function (n) { return 1000 * 60 * 60 * 24 * (n || 30); }
  };

  /* ------------------------------------------------------------- analytics */
  GG.track = function (event, payload) {
    try {
      if (w.gtag) w.gtag('event', event, payload || {});
      if (w.fbq) w.fbq('track', event, payload || {});
      if (w.dataLayer) w.dataLayer.push(Object.assign({ event: event }, payload || {}));
    } catch (e) { }
  };
})(window, document);
