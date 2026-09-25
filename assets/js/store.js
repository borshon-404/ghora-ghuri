/* ==========================================================================
   GHORA GHURI - store.js
   Unified Data & Persistence Layer. Connects transparently to the backend
   Serverless API with Edge Config global storage, falling back gracefully
   to local cache when offline.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var GG = w.GG;
  var K = {
    dest: 'gg.destinations.v1',
    pkg: 'gg.packages.v1',
    blog: 'gg.blog.v1',
    pages: 'gg.pages.v1',
    settings: 'gg.settings.v1',
    portfolio: 'gg.portfolio.v1',
    bookings: 'gg.bookings.v1',
    session: 'gg.admin.session',
    token: 'gg.admin.token',
    api: 'gg.use-api'
  };
  var STORE = GG.store = {};

  function ls() {
    try { return w.localStorage; } catch (e) { return null; }
  }
  function read(key, fallback) {
    var s = ls();
    if (!s) return fallback;
    try {
      var raw = s.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    var s = ls();
    if (!s) return false;
    try { s.setItem(key, JSON.stringify(value)); return true; }
    catch (e) {
      console.warn('LocalStorage write failed:', e);
      return false;
    }
  }

  STORE.keys = K;
  STORE.read = read;
  STORE.write = write;

  // Always enable live backend API when available
  STORE.useApi = function () {
    return true;
  };

  /* ------------------------------------------------------------ collections */
  function getApiHeaders() {
    var token = read(K.token, null);
    var h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  function api(kind, opts) {
    opts = opts || {};
    opts.headers = Object.assign(getApiHeaders(), opts.headers || {});
    var base = (GG.cfg && GG.cfg.apiBase) ? GG.cfg.apiBase.replace(/\/$/, '') : window.location.origin;
    return w.fetch(base + '/api/' + kind, opts).then(function (r) {
      if (!r.ok) throw new Error('API ' + r.status);
      return r.json();
    });
  }

  STORE.api = api;

  STORE.get = function (kind) {
    var overrideKey = K[kind] || ('gg.' + kind + '.v1');
    return api(kind).then(function (data) {
      if (data) {
        write(overrideKey, data);
        if (GG.data && GG.data.put) GG.data.put(kind, data);
        return data;
      }
      throw new Error('Empty from server');
    }).catch(function (e) {
      var cached = read(overrideKey, null);
      if (cached) return cached;
      return (GG.data && GG.data.load) ? GG.data.load(kind) : [];
    });
  };

  STORE.put = function (kind, items) {
    var overrideKey = K[kind] || ('gg.' + kind + '.v1');
    write(overrideKey, items);
    if (GG.data && GG.data.put) GG.data.put(kind, items);
    return api(kind, {
      method: 'PUT',
      body: JSON.stringify(items)
    }).catch(function (err) {
      console.warn('API sync failed, saved locally:', err);
      return { ok: true, offline: true };
    });
  };

  STORE.all = function () {
    return Promise.all([STORE.get('destinations'), STORE.get('packages')])
      .then(function (r) {
        return { destinations: r[0], packages: r[1] };
      });
  };

  STORE.upsert = function (kind, item) {
    return STORE.get(kind).then(function (list) {
      var copy = Array.isArray(list) ? list.slice() : [];
      var idx = -1;
      for (var i = 0; i < copy.length; i++) {
        if (copy[i].id === item.id) { idx = i; break; }
      }
      if (idx >= 0) copy[idx] = Object.assign({}, copy[idx], item);
      else copy.unshift(item);
      return STORE.put(kind, copy);
    });
  };

  STORE.remove = function (kind, id) {
    return STORE.get(kind).then(function (list) {
      var filtered = Array.isArray(list) ? list.filter(function (r) { return r.id !== id; }) : [];
      return STORE.put(kind, filtered);
    });
  };

  /* --------------------------------------------------------------- bookings */
  STORE.bookings = {
    list: function () {
      return api('bookings').catch(function () {
        return read(K.bookings, []);
      });
    },
    add: function (booking) {
      return api('bookings', {
        method: 'POST',
        body: JSON.stringify(booking)
      }).then(function (res) {
        var list = read(K.bookings, []);
        list.unshift(Object.assign({ id: res.id, at: new Date().toISOString() }, booking));
        write(K.bookings, list);
        return res;
      });
    },
    remove: function (id) {
      var list = read(K.bookings, []).filter(function (b) { return b.id !== id; });
      write(K.bookings, list);
      return list;
    }
  };

  /* ---------------------------------------------------------------- export */
  STORE.exportBundle = function () {
    return Promise.all([
      STORE.get('destinations'),
      STORE.get('packages'),
      STORE.get('blog'),
      STORE.get('settings'),
      STORE.get('pages'),
      STORE.get('portfolio'),
      STORE.bookings.list()
    ]).then(function (r) {
      return {
        generator: 'GHORA GHURI Admin Headless CMS',
        exportedAt: new Date().toISOString(),
        counts: {
          destinations: r[0].length,
          packages: r[1].length,
          blog: r[2].length,
          portfolio: (r[5] || []).length,
          bookings: r[6].length
        },
        destinations: r[0],
        packages: r[1],
        blog: r[2],
        settings: r[3],
        pages: r[4],
        portfolio: r[5],
        bookings: r[6]
      };
    });
  };

  STORE.download = function (obj, filename) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = d.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'ghora-ghuri-export.json';
    d.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  };

  STORE.importBundle = function (json) {
    try {
      var data = typeof json === 'string' ? JSON.parse(json) : json;
      if (Array.isArray(data)) {
        STORE.put('destinations', data);
        return { destinations: data.length };
      }
      if (data.destinations) STORE.put('destinations', data.destinations);
      if (data.packages) STORE.put('packages', data.packages);
      if (data.blog) STORE.put('blog', data.blog);
      if (data.settings) STORE.put('settings', data.settings);
      if (data.pages) STORE.put('pages', data.pages);
      if (data.portfolio) STORE.put('portfolio', data.portfolio);
      return {
        destinations: (data.destinations || []).length,
        packages: (data.packages || []).length
      };
    } catch (e) { return null; }
  };

  /* ----------------------------------------------------- admin auth (live) */
  var DEMO_USER = 'ghora-admin';
  var DEMO_PASS = 'ChangeMe!2026';

  STORE.login = function (user, pass) {
    var base = (GG.cfg && GG.cfg.apiBase) ? GG.cfg.apiBase.replace(/\/$/, '') : window.location.origin;
    return w.fetch(base + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: user, pass: pass })
    }).then(function (r) {
      if (!r.ok) return false;
      return r.json().then(function (res) {
        if (res && res.token) {
          write(K.session, { at: Date.now(), user: user });
          write(K.token, res.token);
          return true;
        }
        return false;
      });
    }).catch(function () {
      if (user === DEMO_USER && pass === DEMO_PASS) {
        write(K.session, { at: Date.now(), user: user });
        return true;
      }
      return false;
    });
  };

  STORE.logout = function () {
    write(K.session, null);
    write(K.token, null);
    return true;
  };

  STORE.session = function () {
    var s = read(K.session, null);
    if (!s || !s.at) return false;
    if (Date.now() - s.at > 1000 * 60 * 60 * 8) {
      write(K.session, null);
      write(K.token, null);
      return false;
    }
    return true;
  };

  STORE.adminUser = function () { return read(K.session, {}).user || DEMO_USER; };
  STORE.isDemoCredential = function () { return true; };
})(window, document);
