/* ==========================================================================
   GHORA GHURI - store.js
   Browser-side persistence. Reads data/*.json, then layers any local edits
   (admin panel) on top via localStorage, and keeps bookings + draft state.
   `GG.cfg.apiBase` switches the same API to a real backend (server-stubs/).
   ========================================================================== */
(function (w, d) {
  'use strict';
  var GG = w.GG;
  var K = {
    dest: 'gg.destinations.v1',
    pkg: 'gg.packages.v1',
    bookings: 'gg.bookings.v1',
    session: 'gg.admin.session',
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
      GG.warnOnce('quota', 'Browser storage is full or blocked - changes were not saved. Export the JSON and place it in data/.');
      return false;
    }
  }
  STORE.keys = K;
  STORE.read = read;
  STORE.write = write;

  STORE.useApi = function () {
    return !!GG.cfg.apiBase && read(K.api, false) === true;
  };

  /* ------------------------------------------------------------ collections */
  function api(kind, opts) {
    return w.fetch(GG.cfg.apiBase.replace(/\/$/, '') + '/api/' + kind, opts).then(function (r) {
      if (!r.ok) throw new Error('API ' + r.status);
      return r.json();
    });
  }

  STORE.get = function (kind) {
    var overrideKey = kind === 'destinations' ? K.dest : K.pkg;
    if (STORE.useApi()) {
      return api(kind).then(function (rows) {
        GG.data.put(kind, rows);
        return rows;
      }).catch(function () { return local(kind, overrideKey); });
    }
    return local(kind, overrideKey);
  };

  function local(kind, overrideKey) {
    var override = read(overrideKey, null);
    if (override && override.length) {
      GG.data.put(kind, override);
      return Promise.resolve(override);
    }
    return GG.data.load(kind);
  }

  STORE.all = function () {
    return Promise.all([STORE.get('destinations'), STORE.get('packages')])
      .then(function (r) { return { destinations: r[0], packages: r[1] }; });
  };

  STORE.save = function (kind, rows) {
    var key = kind === 'destinations' ? K.dest : K.pkg;
    GG.data.put(kind, rows);
    if (STORE.useApi()) {
      return api(kind, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows)
      }).then(function () { return true; })
        .catch(function () { return write(key, rows); });
    }
    write(key, rows);
    return Promise.resolve(true);
  };

  STORE.upsert = function (kind, rec) {
    return STORE.get(kind).then(function (rows) {
      var i = rows.findIndex(function (r) { return r.id === rec.id; });
      if (i > -1) rows[i] = Object.assign(rows[i], rec); else rows.unshift(rec);
      return STORE.save(kind, rows).then(function () { return rec; });
    });
  };

  STORE.remove = function (kind, id) {
    return STORE.get(kind).then(function (rows) {
      var next = rows.filter(function (r) { return r.id !== id; });
      return STORE.save(kind, next).then(function () { return next.length; });
    });
  };

  STORE.reset = function (kind) {
    var s = ls();
    if (s) { s.removeItem(kind === 'destinations' ? K.dest : K.pkg); }
    w.location.reload();
  };

  /* -------------------------------------------------------------- bookings */
  STORE.bookings = {
    list: function () {
      if (STORE.useApi()) {
        return api('bookings').catch(function () { return read(K.bookings, []); });
      }
      return Promise.resolve(read(K.bookings, []));
    },
    add: function (b) {
      var rows = read(K.bookings, []);
      rows.unshift(b);
      rows = rows.slice(0, 200);
      write(K.bookings, rows);
      STORE.write(K.bookings + '.count', rows.length);
      if (STORE.useApi()) {
        return api('bookings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
        }).then(function () { return b; }).catch(function () { return b; });
      }
      return Promise.resolve(b);
    },
    remove: function (id) {
      var rows = read(K.bookings, []).filter(function (b) { return b.id !== id; });
      write(K.bookings, rows);
      return rows;
    },
    /** YYYYMMDD-XXXX, sequential per day, stable enough for a printed voucher */
    nextId: function () {
      var now = new Date();
      var stamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
      var seq = 1 + read(K.bookings, []).filter(function (b) { return (b.id || '').indexOf('GG-' + stamp) === 0; }).length;
      return 'GG-' + stamp + '-' + String(seq).padStart(3, '0');
    }
  };

  /* ---------------------------------------------------------------- export */
  STORE.exportBundle = function () {
    return Promise.all([STORE.get('destinations'), STORE.get('packages'), STORE.bookings.list()])
      .then(function (r) {
        return {
          generator: 'GHORA GHURI admin', exportedAt: new Date().toISOString(),
          counts: { destinations: r[0].length, packages: r[1].length, bookings: r[2].length },
          destinations: r[0], packages: r[1], bookings: r[2]
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
      if (Array.isArray(data)) { write(K.dest, data); return { destinations: data.length }; }
      if (data.destinations) write(K.dest, data.destinations);
      if (data.packages) write(K.pkg, data.packages);
      return { destinations: (data.destinations || []).length, packages: (data.packages || []).length };
    } catch (e) { return null; }
  };

  /* ----------------------------------------------------- admin auth (demo) */
  var DEMO_USER = 'ghora-admin';
  var DEMO_PASS = 'ChangeMe!2026';
  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return 'fallback-' + h.toString(16);
  }
  function sha256Hex(str) {
    if (!(w.crypto && w.crypto.subtle)) return Promise.resolve(djb2(str));
    var buf = new TextEncoder().encode(str);
    return w.crypto.subtle.digest('SHA-256', buf).then(function (hash) {
      return Array.prototype.map.call(new Uint8Array(hash), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    }).catch(function () { return djb2(str); });
  }
  STORE.hash = sha256Hex;
  STORE.expectedHash = function () {
    var custom = read('gg.admin.hash', null);
    if (custom) return Promise.resolve(custom);
    return sha256Hex(DEMO_USER + ':' + DEMO_PASS).then(function (h) { return h; });
  };
  STORE.login = function (user, pass) {
    return Promise.all([sha256Hex(user + ':' + pass), STORE.expectedHash()]).then(function (r) {
      if (r[0] === r[1]) {
        write(K.session, { at: Date.now(), user: user });
        return true;
      }
      return false;
    });
  };
  STORE.logout = function () { write(K.session, null); return true; };
  STORE.session = function () {
    var s = read(K.session, null);
    if (!s || !s.at) return false;
    if (Date.now() - s.at > 1000 * 60 * 60 * 2) { write(K.session, null); return false; }
    return true;
  };
  STORE.setCredentials = function (user, pass) {
    if (!user || pass.length < 10) return Promise.resolve(false);
    return sha256Hex(user + ':' + pass).then(function (h) {
      write('gg.admin.hash', h); write('gg.admin.user', user); return true;
    });
  };
  STORE.adminUser = function () { return read('gg.admin.user', DEMO_USER); };
  STORE.isDemoCredential = function () { return !read('gg.admin.hash', null); };
})(window, document);
