/* ==========================================================================
   GHORA GHURI - admin.js
   Demo content manager for the preview build. Persists destination/package
   edits in localStorage, exports the exact JSON shape the server reads, and
   speaks to server-stubs/api-example-node.js when "Server mode" is enabled.
   NOT a security boundary: any static-site login can be bypassed. See README
   before putting real data behind it.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var GG = w.GG;
  var DIVISIONS = ['Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Barishal', 'Sylhet', 'Rangpur', 'Mymensingh'];
  var TAGS = ['beach', 'heritage', 'hill', 'wildlife', 'eco', 'river', 'lake', 'island', 'haor', 'village',
    'city', 'pilgrimage', 'adventure', 'photography', 'family', 'offbeat', 'museum', 'architecture', 'birding'];
  var editKind = 'destinations', editId = null;

  function toast(msg, kind) { (GG.toast || function (m) { w.alert(m); })(msg, kind); }
  function $(sel, ctx) { return (ctx || d).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || d).querySelectorAll(sel)); }

  /* ------------------------------------------------------------------ gate */
  function bootGate() {
    var gate = $('#js-login'), app = $('#js-admin-app');
    if (!gate || !app) return;
    var demo = GG.store.isDemoCredential();
    function show(loggedIn) {
      gate.hidden = loggedIn; app.hidden = !loggedIn;
      if (loggedIn) start();
    }
    show(GG.store.session());
    function fill() {
      $('#lg-user').value = 'ghora-admin';
      $('#lg-pass').value = 'ChangeMe!2026';
      toast('Demo credentials inserted - replace them under Settings before going live.');
    }
    $('#js-login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = $('#lg-user').value.trim(), p = $('#lg-pass').value;
      GG.store.login(u, p).then(function (ok) {
        if (!ok) { $('#lg-error').textContent = 'Sign-in failed. Check the username and passcode.'; return; }
        $('#lg-error').textContent = '';
        show(true);
      });
    });
    var fillBtn = $('#js-fill-demo');
    if (fillBtn) GG.on(fillBtn, 'click', fill);
    if (demo) {
      var note = $('#js-demo-warning', gate);
      if (note) note.hidden = false;
    }
    GG.on($('#js-logout', app), 'click', function () { GG.store.logout(); w.location.reload(); });
  }

  /* ----------------------------------------------------------------- start */
  var data = { destinations: [], packages: [], bookings: [] };
  function start() {
    Promise.all([GG.store.get('destinations'), GG.store.get('packages'), GG.store.bookings.list()])
      .then(function (r) {
        data.destinations = r[0]; data.packages = r[1]; data.bookings = r[2];
        renderStats(); bindTabs(); renderTable(); renderSelects();
        $('#js-server-mode').checked = GG.store.useApi();
      });
  }

  function bindTabs() {
    $$('[data-tab]').forEach(function (btn) {
      GG.on(btn, 'click', function () {
        $$('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b === btn)); });
        $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== btn.getAttribute('data-tab'); });
      });
    });
    GG.on($('#js-export'), 'click', function () {
      GG.store.exportBundle().then(function (b) {
        GG.store.download(b, 'ghora-ghuri-data.json');
        toast('Exported ghora-ghuri-data.json - place destinations and packages arrays into data/*.json');
      });
    });
    GG.on($('#js-export-dest'), 'click', function () {
      GG.store.download(data.destinations, 'destinations.json');
      toast('destinations.json downloaded (full seed shape, ready for data/).');
    });
    var imp = $('#js-import-file');
    GG.on(imp, 'change', function () {
      var f = imp.files && imp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var res = GG.store.importBundle(fr.result);
        if (!res) { toast('That file is not valid JSON.', 'error'); return; }
        toast('Imported ' + (res.destinations || 0) + ' destinations - reloading.');
        setTimeout(function () { w.location.reload(); }, 600);
      };
      fr.readAsText(f);
    });
    GG.on($('#js-server-mode'), 'change', function (e) {
      GG.store.write('gg.use-api', e.target.checked);
      toast(e.target.checked
        ? 'Server mode ON: edits PUT to ' + (GG.cfg.apiBase || 'http://localhost:8787') + '/api/* and fall back to localStorage when unreachable.'
        : 'Server mode OFF: edits stay in this browser (localStorage).');
    });
    GG.on($('#js-reset'), 'click', function () {
      if (!w.confirm('Discard all local edits and return to the shipped data/*.json seed? Bookings are kept.')) return;
      var s = d.cookie; void s;
      try { w.localStorage.removeItem(GG.store.keys.dest); w.localStorage.removeItem(GG.store.keys.pkg); } catch (e) { }
      w.location.reload();
    });
    var cred = $('#js-cred-form');
    if (cred) GG.on(cred, 'submit', function (e) {
      e.preventDefault();
      var u = $('#cr-user').value.trim(), p = $('#cr-pass').value;
      if (p.length < 10) { toast('Use at least 10 characters.', 'error'); return; }
      GG.store.setCredentials(u, p).then(function (ok) {
        toast(ok ? 'Passcode hash updated in this browser. Set the real credential in the server .env.' : 'Could not save.', ok ? 'ok' : 'error');
      });
    });
  }

  function renderStats() {
    var byDiv = {};
    data.destinations.forEach(function (r) { byDiv[r.division] = (byDiv[r.division] || 0) + 1; });
    var price = data.destinations.map(function (r) { return r.price_range_min || 0; }).sort(function (a, b) { return a - b; });
    var stats = [
      ['Destinations', data.destinations.length],
      ['Divisions covered', Object.keys(byDiv).length + '/8'],
      ['Packages', data.packages.length],
      ['Booking requests', data.bookings.length],
      ['Median from price', price.length ? 'Tk ' + price[Math.floor(price.length / 2)] : '-'],
      ['Local edits', GG.store.read(GG.store.keys.dest, null) ? 'yes (localStorage)' : 'none']
    ];
    var host = $('#js-stats');
    if (host) host.innerHTML = stats.map(function (s) {
      return '<div class="card card--pad center"><b style="font-family:var(--serif);font-size:1.7rem;color:var(--brand)">' + s[1] +
        '</b><span class="muted small">' + s[0] + '</span></div>';
    }).join('');
    var chart = $('#js-chart');
    if (chart) {
      var max = Math.max.apply(null, Object.keys(byDiv).map(function (k) { return byDiv[k]; }).concat([1]));
      chart.innerHTML = Object.keys(byDiv).sort().map(function (k) {
        var pct = Math.round(byDiv[k] / max * 100);
        return '<div class="row" style="align-items:center;gap:.6rem;margin-bottom:.35rem">' +
          '<span style="width:110px" class="small">' + k + '</span>' +
          '<span style="flex:1;height:10px;background:#eef2ef;border-radius:6px;overflow:hidden">' +
          '<span style="display:block;height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--brand),var(--gold))"></span></span>' +
          '<b class="small">' + byDiv[k] + '</b></div>';
      }).join('');
    }
    var recent = $('#js-recent-bookings');
    if (recent) {
      recent.innerHTML = data.bookings.length
        ? '<table class="table"><thead><tr><th>Ref</th><th>Traveller</th><th>Trip</th><th>Dates</th><th>Est.</th><th></th></tr></thead><tbody>' +
        data.bookings.slice(0, 12).map(function (b) {
          return '<tr><td><code>' + GG.esc(b.id) + '</code></td><td>' + GG.esc(b.details.name) + '</td><td>' +
            GG.esc(b.quote ? b.quote.label : '-') + '</td><td>' + GG.fmt.date(b.details.date_start) + '</td><td>' +
            (b.quote ? GG.fmt.money(b.quote.total) : '-') + '</td><td><button class="btn btn--ghost btn--sm" data-del-booking="' +
            GG.esc(b.id) + '">Remove</button></td></tr>';
        }).join('') + '</tbody></table>'
        : '<p class="muted">No booking requests recorded on this device. Submit one from the booking page to see the flow.</p>';
      if (recent._unbound !== true) {
        recent._unbound = true;
        recent.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-del-booking]');
          if (!btn) return;
          data.bookings = GG.store.bookings.remove(btn.getAttribute('data-del-booking'));
          renderStats(); toast('Booking removed from local storage.');
        });
      }
    }
  }

  /* ------------------------------------------------------------- collections */
  function renderSelects() {
    var sel = $('#js-collection');
    if (!sel || sel._bound) return;
    sel._bound = true;
    GG.on(sel, 'change', function () { editKind = sel.value; editId = null; renderTable(); renderForm(); });
  }

  function renderTable() {
    var host = $('#js-table');
    if (!host) return;
    var rows = data[editKind] || [];
    var term = ($('#js-table-search').value || '').toLowerCase();
    var filtered = rows.filter(function (r) {
      if (!term) return true;
      return [r.name || r.title, r.division, r.district].join(' ').toLowerCase().indexOf(term) > -1;
    });
    host.innerHTML =
      '<p class="small muted">' + filtered.length + ' of ' + rows.length + ' ' + editKind + '</p>' +
      '<div style="max-height:56vh;overflow:auto"><table class="table table--sticky"><thead><tr>' +
      '<th>Name</th><th>Division / type</th><th>District</th><th>Price from</th><th></th></tr></thead><tbody>' +
      filtered.map(function (r) {
        return '<tr><td><b>' + GG.esc(r.name || r.title) + '</b><br><code class="small">' + GG.esc(r.id) + '</code></td>' +
          '<td>' + GG.esc(r.division || (r.tags || [])[0] || '') + '</td><td>' + GG.esc(r.district || '-') + '</td>' +
          '<td>' + (r.price_min || r.price_range_min ? GG.fmt.money(r.price_min || r.price_range_min) : '-') + '</td>' +
          '<td class="row" style="gap:.3rem"><button class="btn btn--ghost btn--sm" data-edit="' + GG.esc(r.id) + '">Edit</button>' +
          '<button class="btn btn--ghost btn--sm" data-dup="' + GG.esc(r.id) + '">Duplicate</button>' +
          '<button class="btn btn--ghost btn--sm" data-del="' + GG.esc(r.id) + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    host.onclick = function (e) {
      var ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), dup = e.target.closest('[data-dup]');
      if (ed) { editId = ed.getAttribute('data-edit'); renderForm(); $('#js-editor').scrollIntoView({ block: 'start' }); }
      else if (del) {
        if (!w.confirm('Delete this ' + (editKind === 'destinations' ? 'destination' : 'package') + '?')) return;
        GG.store.remove(editKind, del.getAttribute('data-del')).then(function () {
          data[editKind] = data[editKind].filter(function (r) { return r.id !== del.getAttribute('data-del'); });
          renderTable(); renderStats(); toast('Deleted.');
        });
      } else if (dup) {
        var src = data[editKind].filter(function (r) { return r.id === dup.getAttribute('data-dup'); })[0];
        var copy = JSON.parse(JSON.stringify(src));
        copy.id = GG.util.slug(copy.id + '-copy-' + Date.now().toString().slice(-3));
        copy.name = (copy.name || copy.title) + ' (copy)';
        if (copy.title) copy.title = copy.name;
        GG.store.upsert(editKind, copy).then(function () {
          data[editKind].unshift(copy); renderTable(); renderStats(); toast('Duplicated as ' + copy.id);
        });
      }
    };
    var search = $('#js-table-search');
    if (search && !search._b) { search._b = 1; GG.on(search, 'input', GG.util.debounce(renderTable, 200)); }
  }

  /* ------------------------------------------------------------- editor UI */
  function field(label, key, value, type, opts) {
    if (type === 'select') {
      return '<div class="field" data-f="' + key + '"><label for="fd-' + key + '">' + label + '</label><select id="fd-' + key + '" name="' + key + '">' +
        opts.map(function (o) { return '<option' + (String(o) === String(value) ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
        '</select></div>';
    }
    if (type === 'textarea') {
      return '<div class="field" data-f="' + key + '"><label for="fd-' + key + '">' + label + '</label>' +
        '<textarea id="fd-' + key + '" name="' + key + '" rows="4">' + GG.esc(value || '') + '</textarea></div>';
    }
    return '<div class="field" data-f="' + key + '"><label for="fd-' + key + '">' + label + '</label>' +
      '<input id="fd-' + key + '" name="' + key + '" type="' + (type || 'text') + '" value="' + GG.esc(value == null ? '' : value) + '"></div>';
  }

  function renderForm() {
    var host = $('#js-form');
    if (!host) return;
    var rec = (data[editKind] || []).filter(function (r) { return r.id === editId; })[0] || null;
    $('#js-editor-title').textContent = (editId ? 'Edit ' : 'New ') + (editKind === 'destinations' ? 'destination' : 'package');
    if (editKind === 'destinations') {
      host.innerHTML = [
        field('Slug (id)', 'id', rec ? rec.id : '', 'text'),
        field('Name (English)', 'name', rec && rec.name),
        field('Name (Bangla)', 'name_bn', rec && rec.name_bn),
        field('Division', 'division', rec && rec.division, 'select', DIVISIONS),
        field('District', 'district', rec && rec.district),
        field('Best time to visit', 'best_time', rec && rec.best_time),
        field('Duration (days)', 'duration_days', rec ? rec.duration_days : 1, 'number'),
        field('Price from (BDT)', 'price_range_min', rec ? rec.price_range_min : 2500, 'number'),
        field('Price to (BDT)', 'price_range_max', rec ? rec.price_range_max : 8000, 'number'),
        field('Latitude', 'latitude', rec ? rec.latitude : 23.0),
        field('Longitude', 'longitude', rec ? rec.longitude : 90.0),
        field('Tags (comma separated)', 'tags', rec ? (rec.tags || []).join(', ') : 'eco, village'),
        field('Short description (30-50 words)', 'short_description', rec && rec.short_description, 'textarea'),
        field('Detailed description (200-500 words)', 'long_description', rec && rec.long_description, 'textarea'),
        field('Highlights (one per line)', 'highlights', rec ? (rec.highlights || []).join('\n') : '', 'textarea'),
        field('Bangla summary (optional)', 'short_bn', rec && rec.short_bn, 'textarea')
      ].join('');
    } else {
      host.innerHTML = [
        field('Slug (id)', 'id', rec ? rec.id : '', 'text'),
        field('Package title', 'title', rec && rec.title),
        field('Division', 'division', rec && rec.division, 'select', DIVISIONS.concat(['Multi-division'])),
        field('Summary', 'summary', rec && rec.summary, 'textarea'),
        field('Duration (days)', 'duration_days', rec ? rec.duration_days : 3, 'number'),
        field('Nights', 'nights', rec ? rec.nights : 2, 'number'),
        field('Price from (BDT)', 'price_min', rec ? rec.price_min : 6500, 'number'),
        field('Price to (BDT)', 'price_max', rec ? rec.price_max : 12000, 'number'),
        field('Group size', 'group_size', rec && rec.group_size),
        field('Stops (comma separated)', 'stops', rec ? (rec.stops || []).join(', ') : ''),
        field('Destination ids (comma separated)', 'destination_ids', rec ? (rec.destination_ids || []).join(', ') : ''),
        field('Included (one per line)', 'included', rec ? (rec.included || []).join('\n') : '', 'textarea'),
        field('Excluded (one per line)', 'excluded', rec ? (rec.excluded || []).join('\n') : '', 'textarea'),
        field('Itinerary (Day: text, one per line)', 'itinerary', rec ? (rec.itinerary || []).map(function (i) { return i.title + ': ' + i.detail; }).join('\n') : '', 'textarea')
      ].join('');
    }
    $('#js-delete-btn').hidden = !rec;
  }

  function collect() {
    var out = {};
    $$('#js-form [name]').forEach(function (n) {
      var v = n.value.trim();
      var key = n.getAttribute('name');
      if (key === 'tags' || key === 'stops' || key === 'destination_ids') out[key] = v ? v.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      else if (key === 'highlights' || key === 'included' || key === 'excluded') out[key] = v ? v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      else if (key === 'itinerary') out[key] = v ? v.split('\n').map(function (line) {
        var i = line.indexOf(':');
        return i > -1 ? { title: line.slice(0, i).trim(), detail: line.slice(i + 1).trim() } : { title: line.trim(), detail: '' };
      }) : [];
      else if (/^(duration_days|nights|price_range_min|price_range_max|price_min|price_max|latitude|longitude)$/.test(key)) out[key] = Number(v) || 0;
      else out[key] = v;
    });
    if (!out.id) out.id = GG.util.slug(out.name || out.title || 'untitled');
    if (editKind === 'destinations') {
      var base = (data.destinations.filter(function (r) { return r.id === editId; })[0]) || {};
      out.slug = out.id;
      out.sample_itinerary = base.sample_itinerary || [{ title: 'Arrival and orientation', detail: 'Pick-up, transfer and an evening walk with a GHORA GHURI guide.' }];
      out.gallery = base.gallery || [];
      out.video_embed = base.video_embed || '';
      out.image = base.image || '';
      out.image_remote = base.image_remote || '';
      out.featured = base.featured || false;
      out.name_bn = out.name_bn || base.name_bn || '';
    }
    return out;
  }

  function wireForm() {
    var f = $('#js-edit-form');
    if (!f) return;
    GG.on(f, 'submit', function (e) {
      e.preventDefault();
      var rec = collect();
      if (!rec.name && !rec.title) { toast('A name or title is required.', 'error'); return; }
      if (rec.id.length < 3) { toast('The slug is too short.', 'error'); return; }
      var isNew = !editId || !data[editKind].some(function (r) { return r.id === editId; });
      if (isNew && data[editKind].some(function (r) { return r.id === rec.id; })) {
        toast('That slug already exists - change it or edit the existing entry.', 'error'); return;
      }
      GG.store.upsert(editKind, rec).then(function () {
        if (isNew) data[editKind].unshift(rec);
        else data[editKind] = data[editKind].map(function (r) { return r.id === rec.id ? Object.assign(r, rec) : r; });
        editId = rec.id;
        renderTable(); renderForm(); renderStats();
        toast((isNew ? 'Created ' : 'Saved ') + rec.id + '. Export JSON to write it to data/.');
      });
    });
    GG.on($('#js-new-btn'), 'click', function () { editId = null; renderForm(); });
    GG.on($('#js-cancel-btn'), 'click', function () { editId = null; renderForm(); });
    GG.on($('#js-delete-btn'), 'click', function () {
      if (!editId || !w.confirm('Delete ' + editId + '?')) return;
      GG.store.remove(editKind, editId).then(function () {
        data[editKind] = data[editKind].filter(function (r) { return r.id !== editId; });
        editId = null; renderTable(); renderForm(); renderStats(); toast('Deleted.');
      });
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { bootGate(); wireForm(); });
  else { bootGate(); wireForm(); }
})(window, document);
