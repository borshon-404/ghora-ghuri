/* ==========================================================================
   GHORA GHURI - admin.js
   Full CMS content manager for GHORA GHURI. Live multi-tier syncing with
   Serverless API, Edge Config global caching, and GitOps commit backup.
   Supports editing:
   - All 142 destinations, 14 tour packages, journal/blog, and portfolio
   - Header, footer, brand name, contact details, social links, announcement bar
   - Homepage hero slides, banners, testimonials, about story, contact info
   ========================================================================== */
(function (w, d) {
  'use strict';
  var GG = w.GG;
  var DIVISIONS = ['Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Barishal', 'Sylhet', 'Rangpur', 'Mymensingh'];
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
  var data = { destinations: [], packages: [], blog: [], portfolio: [], bookings: [], settings: {}, pages: {} };

  function start() {
    Promise.all([
      GG.store.get('destinations'),
      GG.store.get('packages'),
      GG.store.get('blog'),
      GG.store.get('portfolio'),
      GG.store.bookings.list(),
      GG.store.get('settings'),
      GG.store.get('pages')
    ]).then(function (r) {
      data.destinations = r[0] || [];
      data.packages = r[1] || [];
      data.blog = r[2] || [];
      data.portfolio = r[3] || [];
      data.bookings = r[4] || [];
      data.settings = r[5] || {};
      data.pages = r[6] || {};
      renderStats();
      bindTabs();
      renderTable();
      renderSelects();
      populateSiteCMS();
      populatePageCMS();
      var sm = $('#js-server-mode');
      if (sm) sm.checked = GG.store.useApi();
    }).catch(function (err) {
      console.error('Failed to load admin data:', err);
      toast('Error loading backend data. Local cache active.', 'error');
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
        toast('Exported ghora-ghuri-data.json - full dataset snapshot.');
      });
    });
    GG.on($('#js-export-dest'), 'click', function () {
      GG.store.download(data.destinations, 'destinations.json');
      toast('destinations.json downloaded (ready for data/).');
    });
    var imp = $('#js-import-file');
    if (imp) {
      GG.on(imp, 'change', function () {
        var f = imp.files && imp.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          var counts = GG.store.importBundle(r.result);
          if (!counts) { toast('Could not parse that file - check the JSON syntax.', 'error'); return; }
          toast('Imported data successfully. Refreshing...');
          start();
        };
        r.readAsText(f);
      });
    }
    var reset = $('#js-reset');
    if (reset) {
      GG.on(reset, 'click', function () {
        if (!w.confirm('Reset local cache to match server/live data?')) return;
        ['gg.destinations.v1', 'gg.packages.v1', 'gg.blog.v1', 'gg.settings.v1', 'gg.pages.v1', 'gg.portfolio.v1'].forEach(function (k) {
          try { localStorage.removeItem(k); } catch (e) {}
        });
        toast('Local overrides cleared. Refreshing from server...');
        setTimeout(function () { w.location.reload(); }, 600);
      });
    }
    var cred = $('#js-cred-form');
    if (cred) {
      GG.on(cred, 'submit', function (e) {
        e.preventDefault();
        var u = $('#cr-user').value.trim(), p = $('#cr-pass').value;
        toast('Updating admin passcode on server...');
        fetch('/api/admin/login', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: u, pass: p })
        }).then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok) toast('Passcode updated on server and saved permanently!');
          else toast('Failed to update passcode on server.', 'error');
        }).catch(function () {
          toast('Updated passcode locally.', 'info');
        });
      });
    }

    // Image preview helper
    var imgInput = $('#sc-img-preview-in');
    var imgBox = $('#js-img-preview-box');
    if (imgInput && imgBox) {
      GG.on(imgInput, 'input', function () {
        var v = imgInput.value.trim();
        if (v) {
          imgBox.innerHTML = '<img src="' + v + '" alt="Preview" style="max-height:100%;max-width:100%;object-fit:cover" onerror="this.src=\'\';this.alt=\'Invalid image URL\'">';
        } else {
          imgBox.innerHTML = '<span class="small muted">Image preview will show here</span>';
        }
      });
    }
  }

  /* ------------------------------------------------------------- overview */
  function renderStats() {
    var byDiv = {};
    data.destinations.forEach(function (r) { byDiv[r.division] = (byDiv[r.division] || 0) + 1; });
    var stats = [
      ['Destinations', data.destinations.length],
      ['Packages', data.packages.length],
      ['Portfolio Projects', (data.portfolio || []).length],
      ['Journal Articles', (data.blog || []).length],
      ['Booking Requests', data.bookings.length],
      ['Live Sync', 'Connected to Edge Config & GitOps']
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
        data.bookings.slice(0, 15).map(function (b) {
          return '<tr><td><code>' + GG.esc(b.id) + '</code></td><td>' + GG.esc((b.details && b.details.name) || b.name || '-') + '</td><td>' +
            GG.esc(b.quote ? b.quote.label : (b.package_name || '-')) + '</td><td>' + ((b.details && b.details.date_start) || b.date_start || '-') + '</td><td>' +
            (b.quote ? GG.fmt.money(b.quote.total) : '-') + '</td><td><button class="btn btn--ghost btn--sm" data-del-booking="' +
            GG.esc(b.id) + '">Remove</button></td></tr>';
        }).join('') + '</tbody></table>'
        : '<p class="muted">No booking requests recorded yet.</p>';
      if (recent._unbound !== true) {
        recent._unbound = true;
        recent.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-del-booking]');
          if (!btn) return;
          var bId = btn.getAttribute('data-del-booking');
          data.bookings = GG.store.bookings.remove(bId);
          renderStats(); toast('Booking removed.');
        });
      }
    }
  }

  /* ------------------------------------------------------------- Site & Header/Footer CMS */
  function populateSiteCMS() {
    var s = data.settings || {};
    var f = $('#js-site-cms-form');
    if (f) {
      ['site_name', 'site_tagline', 'founder_name', 'phone', 'email', 'whatsapp', 'address', 'license_badge',
       'social_facebook', 'social_instagram', 'social_youtube', 'announcement_bar'].forEach(function (k) {
        var el = f.elements[k];
        if (el) el.value = s[k] || '';
      });
      if (f.elements['announcement_active']) {
        f.elements['announcement_active'].checked = Boolean(s.announcement_active);
      }
      f.onsubmit = function (e) {
        e.preventDefault();
        var updated = Object.assign({}, data.settings);
        new FormData(f).forEach(function (val, key) { updated[key] = val; });
        updated.announcement_active = f.elements['announcement_active'].checked;
        toast('Publishing site & header settings to live servers...');
        GG.store.put('settings', updated).then(function () {
          data.settings = updated;
          if (GG.hydrateCMS) GG.hydrateCMS();
          toast('Site settings and header updated globally!');
        }).catch(function (err) { toast('Error saving: ' + err.message, 'error'); });
      };
    }

    var fFooter = $('#js-footer-cms-form');
    if (fFooter) {
      ['footer_about', 'copyright_text', 'gaMeasurementId'].forEach(function (k) {
        var el = fFooter.elements[k];
        if (el) el.value = s[k] || '';
      });
      fFooter.onsubmit = function (e) {
        e.preventDefault();
        var updated = Object.assign({}, data.settings);
        new FormData(fFooter).forEach(function (val, key) { updated[key] = val; });
        toast('Publishing footer details to live servers...');
        GG.store.put('settings', updated).then(function () {
          data.settings = updated;
          if (GG.hydrateCMS) GG.hydrateCMS();
          toast('Footer details updated globally!');
        }).catch(function (err) { toast('Error saving: ' + err.message, 'error'); });
      };
    }
  }

  /* ------------------------------------------------------------- Pages Content CMS */
  var curPage = 'home';
  function populatePageCMS() {
    var sel = $('#js-page-select');
    if (sel && !sel._b) {
      sel._b = 1;
      GG.on(sel, 'change', function () {
        curPage = sel.value;
        renderPageFields();
      });
    }
    renderPageFields();

    var form = $('#js-page-cms-form');
    if (form && !form._b) {
      form._b = 1;
      form.onsubmit = function (e) {
        e.preventDefault();
        savePageFields();
      };
    }
  }

  function renderPageFields() {
    var host = $('#js-page-fields');
    if (!host) return;
    var pages = data.pages || {};
    var pageData = pages[curPage] || {};

    if (curPage === 'home') {
      var slides = pageData.hero_slides || [];
      var slidesHTML = slides.map(function (s, i) {
        return '<div class="card card--pad" style="margin-bottom:1rem;background:#fafbfa;border:1px solid #e1e8e3">' +
          '<h4 style="margin:0 0 .5rem 0">Slide #' + (i + 1) + '</h4>' +
          '<div class="grid grid--2">' +
            field('Eyebrow / Tag', 'slide_eyebrow_' + i, s.eyebrow) +
            field('Background Image URL', 'slide_bg_' + i, s.bg_image) +
          '</div>' +
          field('Slide Heading', 'slide_title_' + i, s.title) +
          field('Subtitle / Description', 'slide_subtitle_' + i, s.subtitle, 'textarea') +
          '<div class="grid grid--2">' +
            field('Primary Button Text', 'slide_cta1_text_' + i, s.cta_primary_text) +
            field('Primary Button Link', 'slide_cta1_link_' + i, s.cta_primary_link) +
            field('Secondary Button Text', 'slide_cta2_text_' + i, s.cta_secondary_text) +
            field('Secondary Button Link', 'slide_cta2_link_' + i, s.cta_secondary_link) +
          '</div>' +
        '</div>';
      }).join('');

      var quotes = pageData.testimonials || [];
      var quotesHTML = quotes.map(function (q, i) {
        return '<div class="card card--pad" style="margin-bottom:.8rem;background:#fafbfa;border:1px solid #e1e8e3">' +
          '<h4 style="margin:0 0 .5rem 0">Testimonial #' + (i + 1) + '</h4>' +
          field('Quote Text', 'quote_text_' + i, q.quote, 'textarea') +
          '<div class="grid grid--3">' +
            field('Client Name', 'quote_author_' + i, q.author) +
            field('Role / City', 'quote_role_' + i, q.role) +
            field('Avatar Initials', 'quote_avatar_' + i, q.avatar) +
          '</div>' +
        '</div>';
      }).join('');

      host.innerHTML =
        '<h3 style="margin-top:0">Hero Slider (Home Banner)</h3>' +
        slidesHTML +
        '<h3 style="margin-top:1.5rem">Sundarbans Feature Band</h3>' +
        field('Band Title', 'sb_title', pageData.sundarban_banner && pageData.sundarban_banner.title) +
        field('Band Description', 'sb_subtitle', pageData.sundarban_banner && pageData.sundarban_banner.subtitle, 'textarea') +
        '<div class="grid grid--2">' +
          field('Button Text', 'sb_link_text', pageData.sundarban_banner && pageData.sundarban_banner.link_text) +
          field('Button Link', 'sb_link_url', pageData.sundarban_banner && pageData.sundarban_banner.link_url) +
        '</div>' +
        '<h3 style="margin-top:1.5rem">Traveller Testimonials</h3>' +
        quotesHTML;

    } else if (curPage === 'about') {
      host.innerHTML =
        '<h3 style="margin-top:0">Mission &amp; Leadership</h3>' +
        field('Page Title', 'ab_title', pageData.title) +
        field('Mission Statement (Lead Paragraph)', 'ab_mission', pageData.mission_statement, 'textarea') +
        '<div class="grid grid--2">' +
          field('Founder / Director Name', 'ab_founder_name', pageData.founder_name) +
          field('Founder Title', 'ab_founder_title', pageData.founder_title) +
        '</div>' +
        field('Founder Biography', 'ab_founder_bio', pageData.founder_bio, 'textarea') +
        '<h3 style="margin-top:1.5rem">Company Story</h3>' +
        field('Story Heading', 'ab_story_heading', pageData.story_heading) +
        field('Story Paragraphs (one per block, double newline separated)', 'ab_story_paragraphs', (pageData.story_paragraphs || []).join('\n\n'), 'textarea');

    } else if (curPage === 'contact') {
      host.innerHTML =
        '<h3 style="margin-top:0">Contact Page Details</h3>' +
        field('Main Heading', 'co_heading', pageData.heading) +
        field('Subheading', 'co_subheading', pageData.subheading) +
        field('Office Hours', 'co_office_hours', pageData.office_hours) +
        field('Office Coordinates (Lat, Long)', 'co_coords', pageData.map_coordinates);
    }
  }

  function savePageFields() {
    var form = $('#js-page-cms-form');
    if (!form) return;
    var pages = Object.assign({}, data.pages);
    var pData = Object.assign({}, pages[curPage] || {});

    if (curPage === 'home') {
      var slides = (pData.hero_slides || []).map(function (s, i) {
        return {
          eyebrow: (form.elements['slide_eyebrow_' + i] || {}).value || s.eyebrow,
          bg_image: (form.elements['slide_bg_' + i] || {}).value || s.bg_image,
          title: (form.elements['slide_title_' + i] || {}).value || s.title,
          subtitle: (form.elements['slide_subtitle_' + i] || {}).value || s.subtitle,
          cta_primary_text: (form.elements['slide_cta1_text_' + i] || {}).value || s.cta_primary_text,
          cta_primary_link: (form.elements['slide_cta1_link_' + i] || {}).value || s.cta_primary_link,
          cta_secondary_text: (form.elements['slide_cta2_text_' + i] || {}).value || s.cta_secondary_text,
          cta_secondary_link: (form.elements['slide_cta2_link_' + i] || {}).value || s.cta_secondary_link
        };
      });
      pData.hero_slides = slides;

      pData.sundarban_banner = {
        title: form.elements['sb_title'] ? form.elements['sb_title'].value : '',
        subtitle: form.elements['sb_subtitle'] ? form.elements['sb_subtitle'].value : '',
        link_text: form.elements['sb_link_text'] ? form.elements['sb_link_text'].value : '',
        link_url: form.elements['sb_link_url'] ? form.elements['sb_link_url'].value : ''
      };

      var quotes = (pData.testimonials || []).map(function (q, i) {
        return {
          quote: (form.elements['quote_text_' + i] || {}).value || q.quote,
          author: (form.elements['quote_author_' + i] || {}).value || q.author,
          role: (form.elements['quote_role_' + i] || {}).value || q.role,
          avatar: (form.elements['quote_avatar_' + i] || {}).value || q.avatar
        };
      });
      pData.testimonials = quotes;

    } else if (curPage === 'about') {
      pData.title = form.elements['ab_title'] ? form.elements['ab_title'].value : '';
      pData.mission_statement = form.elements['ab_mission'] ? form.elements['ab_mission'].value : '';
      pData.founder_name = form.elements['ab_founder_name'] ? form.elements['ab_founder_name'].value : '';
      pData.founder_title = form.elements['ab_founder_title'] ? form.elements['ab_founder_title'].value : '';
      pData.founder_bio = form.elements['ab_founder_bio'] ? form.elements['ab_founder_bio'].value : '';
      pData.story_heading = form.elements['ab_story_heading'] ? form.elements['ab_story_heading'].value : '';
      if (form.elements['ab_story_paragraphs']) {
        pData.story_paragraphs = form.elements['ab_story_paragraphs'].value.split('\n\n').map(function (s) { return s.trim(); }).filter(Boolean);
      }
    } else if (curPage === 'contact') {
      pData.heading = form.elements['co_heading'] ? form.elements['co_heading'].value : '';
      pData.subheading = form.elements['co_subheading'] ? form.elements['co_subheading'].value : '';
      pData.office_hours = form.elements['co_office_hours'] ? form.elements['co_office_hours'].value : '';
      pData.map_coordinates = form.elements['co_coords'] ? form.elements['co_coords'].value : '';
    }

    pages[curPage] = pData;
    toast('Publishing ' + curPage + ' page content to live servers & Edge Config...');
    GG.store.put('pages', pages).then(function () {
      data.pages = pages;
      if (GG.hydrateCMS) GG.hydrateCMS();
      toast('Page contents saved and live across website!');
    }).catch(function (err) {
      toast('Saved locally: ' + err.message, 'info');
    });
  }

  /* ------------------------------------------------------------- collections */
  function renderSelects() {
    var sel = $('#js-collection');
    if (!sel || sel._bound) return;
    sel._bound = true;
    GG.on(sel, 'change', function () {
      var val = sel.value;
      if (val.indexOf('destinations') > -1) editKind = 'destinations';
      else if (val.indexOf('packages') > -1) editKind = 'packages';
      else if (val.indexOf('blog') > -1) editKind = 'blog';
      else if (val.indexOf('portfolio') > -1) editKind = 'portfolio';
      else editKind = val;
      editId = null;
      renderTable();
      renderForm();
    });
  }

  function renderTable() {
    var host = $('#js-table');
    if (!host) return;
    var rows = data[editKind] || [];
    var term = ($('#js-table-search').value || '').toLowerCase();
    var filtered = rows.filter(function (r) {
      if (!term) return true;
      return [r.name || r.title, r.division || r.tag || r.category || '', r.district || r.author || r.client || ''].join(' ').toLowerCase().indexOf(term) > -1;
    });
    host.innerHTML =
      '<p class="small muted">' + filtered.length + ' of ' + rows.length + ' ' + editKind + '</p>' +
      '<div style="max-height:56vh;overflow:auto"><table class="table table--sticky"><thead><tr>' +
      '<th>Name / Title</th><th>' + (editKind === 'blog' ? 'Tag / Date' : (editKind === 'portfolio' ? 'Category / Client' : 'Division / Type')) + '</th>' +
      '<th>' + (editKind === 'blog' ? 'Author' : (editKind === 'portfolio' ? 'Date' : 'District')) + '</th>' +
      '<th>' + (editKind === 'blog' ? 'Read Time' : (editKind === 'portfolio' ? 'Image' : 'Price from')) + '</th><th></th></tr></thead><tbody>' +
      filtered.map(function (r) {
        var col2 = editKind === 'blog' ? (r.tag + ' / ' + r.date) : (editKind === 'portfolio' ? (r.category + ' &bull; ' + (r.client || '')) : (r.division || (r.tags || [])[0] || ''));
        var col3 = editKind === 'blog' ? (r.author || '') : (editKind === 'portfolio' ? (r.date || '') : (r.district || '-'));
        var col4 = editKind === 'blog' ? (r.read_minutes + ' min') : (editKind === 'portfolio' ? (r.image ? 'Yes' : 'No') : (r.price_min || r.price_range_min ? GG.fmt.money(r.price_min || r.price_range_min) : '-'));
        return '<tr><td><b>' + GG.esc(r.name || r.title) + '</b><br><code class="small">' + GG.esc(r.id) + '</code></td>' +
          '<td>' + col2 + '</td><td>' + GG.esc(col3) + '</td>' +
          '<td>' + col4 + '</td>' +
          '<td class="row" style="gap:.3rem"><button class="btn btn--ghost btn--sm" data-edit="' + GG.esc(r.id) + '">Edit</button>' +
          '<button class="btn btn--ghost btn--sm" data-dup="' + GG.esc(r.id) + '">Duplicate</button>' +
          '<button class="btn btn--ghost btn--sm" data-del="' + GG.esc(r.id) + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    host.onclick = function (e) {
      var ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), dup = e.target.closest('[data-dup]');
      if (ed) {
        editId = ed.getAttribute('data-edit');
        renderForm();
        $('#js-editor').scrollIntoView({ block: 'start' });
      } else if (del) {
        var toDel = del.getAttribute('data-del');
        if (!w.confirm('Delete this ' + editKind.slice(0, -1) + ' (' + toDel + ')?')) return;
        GG.store.remove(editKind, toDel).then(function () {
          data[editKind] = data[editKind].filter(function (r) { return r.id !== toDel; });
          renderTable(); renderStats(); toast('Deleted ' + toDel + ' across server and edge config.');
        });
      } else if (dup) {
        var src = data[editKind].filter(function (r) { return r.id === dup.getAttribute('data-dup'); })[0];
        var copy = JSON.parse(JSON.stringify(src));
        copy.id = GG.util.slug(copy.id + '-copy-' + Date.now().toString().slice(-3));
        copy.name = (copy.name || copy.title) + ' (Copy)';
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
    var singular = editKind === 'destinations' ? 'destination' : (editKind === 'packages' ? 'package' : (editKind === 'blog' ? 'article' : 'portfolio project'));
    $('#js-editor-title').textContent = (editId ? 'Edit ' : 'New ') + singular;

    if (editKind === 'destinations') {
      host.innerHTML = [
        field('Slug (id)', 'id', rec ? rec.id : '', 'text'),
        field('Name (English)', 'name', rec && rec.name),
        field('Name (Bangla)', 'name_bn', rec && rec.name_bn),
        field('Division', 'division', rec && rec.division, 'select', DIVISIONS),
        field('District', 'district', rec && rec.district),
        field('Cover Image (URL or path)', 'image_remote', rec && (rec.image_remote || rec.image)),
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
    } else if (editKind === 'packages') {
      host.innerHTML = [
        field('Slug (id)', 'id', rec ? rec.id : '', 'text'),
        field('Package title', 'title', rec && rec.title),
        field('Division', 'division', rec && rec.division, 'select', DIVISIONS.concat(['Multi-division'])),
        field('Cover Image (URL or path)', 'image', rec && rec.image),
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
    } else if (editKind === 'blog') {
      var bodyText = rec && rec.body ? rec.body.map(function (b) { return b.p ? b.p : ('## ' + b.h); }).join('\n\n') : '';
      host.innerHTML = [
        field('Slug (id)', 'id', rec ? rec.id : '', 'text'),
        field('Article Title', 'title', rec && rec.title),
        field('Category Tag', 'tag', rec ? rec.tag : 'Planning', 'select', ['Planning', 'Guides', 'Culture', 'Wildlife', 'Food', 'Offbeat']),
        field('Author', 'author', rec ? rec.author : 'Mashzidul Tanun Borshon'),
        field('Date (YYYY-MM-DD)', 'date', rec ? rec.date : new Date().toISOString().slice(0, 10)),
        field('Cover Image (slug or URL)', 'image', rec ? rec.image : 'sundarbans'),
        field('Read time (minutes)', 'read_minutes', rec ? rec.read_minutes : 5, 'number'),
        field('Excerpt / Summary', 'excerpt', rec && rec.excerpt, 'textarea'),
        field('Body Content (paragraphs and ## Headings)', 'body_text', bodyText, 'textarea'),
        field('Related Destinations (slugs, comma-separated)', 'related', rec && rec.related ? rec.related.join(', ') : '')
      ].join('');
    } else if (editKind === 'portfolio') {
      host.innerHTML = [
        field('Slug (id)', 'id', rec ? rec.id : '', 'text'),
        field('Project / Expedition Title', 'title', rec && rec.title),
        field('Category', 'category', rec ? rec.category : 'Wildlife & River', 'select', ['Wildlife & River', 'Heritage', 'Eco & Trekking', 'Beach & Island', 'Corporate Retreat']),
        field('Client / Delegation Name', 'client', rec && rec.client),
        field('Date / Year', 'date', rec ? rec.date : '2026-02'),
        field('Hero Image (URL or path)', 'image', rec ? rec.image : 'assets/images/destinations/sundarbans.jpg'),
        field('Expedition Summary & Scope', 'description', rec && rec.description, 'textarea')
      ].join('');
    }
    $('#js-delete-btn').hidden = !rec;
  }

  function collect() {
    var out = {};
    $$('#js-form [name]').forEach(function (n) {
      var v = n.value.trim();
      var key = n.getAttribute('name');
      if (key === 'tags' || key === 'stops' || key === 'destination_ids' || key === 'related') out[key] = v ? v.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      else if (key === 'highlights' || key === 'included' || key === 'excluded') out[key] = v ? v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : [];
      else if (key === 'itinerary') out[key] = v ? v.split('\n').map(function (line) {
        var i = line.indexOf(':');
        return i > -1 ? { title: line.slice(0, i).trim(), detail: line.slice(i + 1).trim() } : { title: line.trim(), detail: '' };
      }) : [];
      else if (/^(duration_days|nights|price_range_min|price_range_max|price_min|price_max|latitude|longitude|read_minutes)$/.test(key)) out[key] = Number(v) || 0;
      else out[key] = v;
    });
    if (!out.id) out.id = GG.util.slug(out.name || out.title || 'untitled');
    if (editKind === 'destinations') {
      var baseD = (data.destinations.filter(function (r) { return r.id === editId; })[0]) || {};
      out.slug = out.id;
      out.sample_itinerary = baseD.sample_itinerary || [{ title: 'Arrival and orientation', detail: 'Pick-up, transfer and an evening walk with a GHORA GHURI guide.' }];
      out.gallery = baseD.gallery || [];
      out.video_embed = baseD.video_embed || '';
      out.image = out.image_remote || baseD.image || '';
      out.image_remote = out.image_remote || baseD.image_remote || '';
      out.featured = baseD.featured != null ? baseD.featured : false;
      out.name_bn = out.name_bn || baseD.name_bn || '';
    } else if (editKind === 'blog') {
      var baseB = (data.blog.filter(function (r) { return r.id === editId; })[0]) || {};
      out.image = out.image || baseB.image || 'sundarbans';
      if (out.body_text) {
        var paragraphs = out.body_text.split('\n\n').map(function (s) { return s.trim(); }).filter(Boolean);
        out.body = paragraphs.map(function (p) {
          if (p.indexOf('##') === 0) return { h: p.replace(/^##\s*/, '') };
          return { p: p };
        });
        delete out.body_text;
      } else {
        out.body = baseB.body || [];
      }
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
      toast('Publishing update to live servers & Edge Config...');
      GG.store.upsert(editKind, rec).then(function () {
        if (isNew) data[editKind].unshift(rec);
        else data[editKind] = data[editKind].map(function (r) { return r.id === rec.id ? Object.assign(r, rec) : r; });
        editId = rec.id;
        renderTable(); renderForm(); renderStats();
        toast('Saved and published: ' + rec.id);
      }).catch(function (err) {
        toast('Saved locally: ' + err.message, 'info');
      });
    });
    GG.on($('#js-new-btn'), 'click', function () { editId = null; renderForm(); });
    GG.on($('#js-cancel-btn'), 'click', function () { editId = null; renderForm(); });
    GG.on($('#js-delete-btn'), 'click', function () {
      if (!editId || !w.confirm('Delete ' + editId + '?')) return;
      GG.store.remove(editKind, editId).then(function () {
        data[editKind] = data[editKind].filter(function (r) { return r.id !== editId; });
        editId = null; renderTable(); renderForm(); renderStats(); toast('Deleted ' + editId);
      });
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { bootGate(); wireForm(); });
  else { bootGate(); wireForm(); }
})(window, document);
