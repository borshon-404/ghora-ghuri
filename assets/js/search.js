/* ==========================================================================
   GHORA GHURI - search.js
   Destination search + faceted filters, division index, and the dynamic
   destination-detail template (data driven from data/destinations.json via
   ?id=<slug>). Also powers the home-page featured carousel.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var GG = w.GG, R = GG.render;
  var state = {
    q: GG.param('q'), division: GG.param('division'), district: GG.param('district'),
    type: GG.param('type'), min: Number(GG.param('min')) || 0, max: Number(GG.param('max')) || 0,
    days: GG.param('days'), rating: Number(GG.param('rating')) || 0,
    sort: GG.param('sort') || 'popular', page: 1, per: 24
  };
  var ALL = [], PACKAGES = [];

  /* --------------------------------------------------------------- helpers */
  function divisions() {
    var set = {};
    ALL.forEach(function (r) { set[r.division] = (set[r.division] || 0) + 1; });
    return Object.keys(set).sort().map(function (k) { return { name: k, count: set[k] }; });
  }
  function tagCounts() {
    var set = {};
    ALL.forEach(function (r) { (r.tags || []).forEach(function (t) { set[t] = (set[t] || 0) + 1; }); });
    return Object.keys(set).filter(function (t) { return set[t] >= 3; })
      .sort(function (a, b) { return set[b] - set[a]; })
      .map(function (k) { return { name: k, count: set[k] }; });
  }
  function maxPrice() {
    return ALL.reduce(function (m, r) { return Math.max(m, Number(r.price_range_max) || 0); }, 0);
  }
  function matches(r) {
    if (state.division && r.division !== state.division) return false;
    if (state.district && r.district !== state.district) return false;
    if (state.type && (r.tags || []).indexOf(state.type) === -1) return false;
    if (state.days) {
      var n = Number(state.days);
      if (state.days.indexOf('max') === 0 && r.duration_days > n) return false;
      if (state.days.indexOf('max') !== 0 && n === 7 && r.duration_days < 7) return false;
      if (state.days.indexOf('max') !== 0 && n !== 7 && r.duration_days !== n) return false;
    }
    if (state.rating && GG.util.ratingOf(r) < state.rating) return false;
    var lo = Number(r.price_range_min) || 0, hi = Number(r.price_range_max) || lo;
    if (state.min && hi < state.min) return false;
    if (state.max && lo > state.max) return false;
    if (state.q) {
      var hay = [r.name, r.name_bn, r.district, r.division, r.short_description,
        (r.tags || []).join(' '), (r.highlights || []).join(' ')].join(' ').toLowerCase();
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return false;
    }
    return true;
  }
  /** text relevance for the keyword box: a name that leads with the word you
   typed beats a mention inside a longer name, which beats a passing description. */
  function relevance(r) {
    var q = (state.q || '').toLowerCase();
    if (!q) return 0;
    var words = q.split(/\s+/).filter(Boolean);
    var nameLc = (r.name || '').toLowerCase();
    var nameWords = nameLc.split(/[^a-z0-9']+/).filter(Boolean);
    var s = 0;
    words.forEach(function (word) {
      if (nameWords.some(function (n) { return n.indexOf(word) === 0; })) s += 30;
      else if (nameLc.indexOf(word) > -1) s += 16;
      if ((r.district || '').toLowerCase().indexOf(word) > -1) s += 10;
      if ((r.division || '').toLowerCase().indexOf(word) > -1) s += 3;
      if ((r.tags || []).join(' ').indexOf(word) > -1) s += 8;
      if ((r.highlights || []).join(' ').toLowerCase().indexOf(word) > -1) s += 4;
      if ((r.short_description || '').toLowerCase().indexOf(word) > -1) s += 3;
      if ((r.long_description || '').toLowerCase().indexOf(word) > -1) s += 2;
    });
    if ((r.name_bn || '').indexOf(q) > -1) s += 12;
    if (r.featured) s += 3;
    s += Math.max(0, 8 - nameLc.length / 6);        // prefer the tight, canonical name
    return s + GG.util.ratingOf(r);
  }

  function sortRows(rows) {
    var s = state.sort;
    if (state.q && (s === 'popular' || s === 'relevance')) {
      rows.sort(function (a, b) { return relevance(b) - relevance(a) || a.name.localeCompare(b.name); });
      return rows;
    }
    rows.sort(function (a, b) {
      if (s === 'price-asc') return (a.price_range_min || 0) - (b.price_range_min || 0);
      if (s === 'price-desc') return (b.price_range_max || 0) - (a.price_range_max || 0);
      if (s === 'name') return a.name.localeCompare(b.name);
      if (s === 'duration') return (a.duration_days || 0) - (b.duration_days || 0);
      if (s === 'rating') return GG.util.ratingOf(b) - GG.util.ratingOf(a);
      return (GG.util.reviewsOf(b) * GG.util.ratingOf(b)) - (GG.util.reviewsOf(a) * GG.util.ratingOf(a));
    });
    return rows;
  }
  function syncUrl() {
    if (!w.history || !w.history.replaceState) return;
    var p = new URLSearchParams();
    ['q', 'division', 'district', 'type', 'days', 'sort'].forEach(function (k) { if (state[k]) p.set(k, state[k]); });
    if (state.min) p.set('min', state.min);
    if (state.max) p.set('max', state.max);
    if (state.rating) p.set('rating', state.rating);
    var qs = p.toString();
    w.history.replaceState({}, '', d.location.pathname + (qs ? '?' + qs : ''));
  }

  /* ---------------------------------------------------------- filter panel */
  function buildFilters() {
    var root = GG.$('#js-filters');
    if (!root) return;
    var dv = divisions(), tg = tagCounts(), hi = maxPrice();
    root.innerHTML =
      '<div class="card filters">' +
        '<div class="filters__title"><h2>' + GG.lang.t('search.filters', 'Refine results') + '</h2>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-reset>' + GG.lang.t('search.reset', 'Reset') + '</button></div>' +
        '<div class="field"><label for="f-q">' + GG.lang.t('search.keyword', 'Search destinations') + '</label>' +
          '<input id="f-q" type="search" name="q" placeholder="Kantajiu, haor, trekking&hellip;" value="' + GG.esc(state.q) + '"></div>' +
        '<div class="field"><label for="f-division">' + GG.lang.t('search.division', 'Division') + '</label>' +
          '<select id="f-division"><option value="">' + GG.lang.t('search.all', 'All divisions') + '</option>' +
          dv.map(function (o) { return '<option value="' + o.name + '"' + (state.division === o.name ? ' selected' : '') + '>' + o.name + ' (' + o.count + ')</option>'; }).join('') +
          '</select></div>' +
        '<div class="field"><label id="lbl-type">' + GG.lang.t('search.type', 'Travel type') + '</label>' +
          '<div class="chips" role="group" aria-labelledby="lbl-type">' +
          tg.map(function (o) {
            return '<button type="button" class="chip" data-type="' + o.name + '" aria-pressed="' +
              (state.type === o.name) + '">' + o.name + ' <span class="muted">(' + o.count + ')</span></button>';
          }).join('') + '</div></div>' +
        '<div class="field"><label for="f-min">' + GG.lang.t('search.price', 'Price per person (BDT)') + '</label>' +
          '<div class="row" style="gap:.5rem"><input id="f-min" type="number" min="0" max="' + hi + '" step="100" placeholder="from" value="' + (state.min || '') + '">' +
          '<input id="f-max" type="number" min="0" max="' + hi + '" step="100" placeholder="to" value="' + (state.max || '') + '"></div>' +
          '<input id="f-range" type="range" min="0" max="' + hi + '" step="250" value="' + (state.max || hi) + '" aria-label="Maximum price">' +
        '</div>' +
        '<div class="field"><label for="f-days">' + GG.lang.t('search.duration', 'Suggested duration') + '</label>' +
          '<select id="f-days">' +
          [['', 'Any length'], ['1', 'Day trip'], ['2', '2 days'], ['3', '3 days'], ['max-2', 'Up to 2 days'], ['max-4', 'Up to 4 days'], ['7', 'A week or more']]
            .map(function (o) { return '<option value="' + o[0] + '"' + (state.days === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="field"><label for="f-rating">' + GG.lang.t('search.rating', 'Minimum rating') + '</label>' +
          '<select id="f-rating">' + [[0, 'Any'], [4.5, '4.5+'], [4.2, '4.2+'], [4, '4.0+']]
            .map(function (o) { return '<option value="' + o[0] + '"' + (String(state.rating) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select></div>' +
        '<p class="hint">' + GG.lang.t('search.hint', 'Filters run in the browser against data/destinations.json - no database needed.') + '</p>' +
      '</div>';

    var q = GG.$('#f-q', root);
    GG.on(q, 'input', GG.util.debounce(function () { state.q = q.value.trim(); state.page = 1; render(); syncUrl(); }, 220));
    GG.on(GG.$('#f-division', root), 'change', function (e) { state.division = e.target.value; state.page = 1; render(); syncUrl(); });
    GG.on(GG.$('#f-days', root), 'change', function (e) { state.days = e.target.value; state.page = 1; render(); syncUrl(); });
    GG.on(GG.$('#f-rating', root), 'change', function (e) { state.rating = Number(e.target.value); state.page = 1; render(); syncUrl(); });
    GG.on(GG.$('#f-min', root), 'change', function (e) { state.min = Number(e.target.value) || 0; render(); syncUrl(); });
    var range = GG.$('#f-range', root), maxIn = GG.$('#f-max', root);
    GG.on(range, 'input', function () { state.max = Number(range.value); maxIn.value = range.value; render(); });
    GG.on(range, 'change', syncUrl);
    GG.on(maxIn, 'change', function () { state.max = Number(maxIn.value) || 0; range.value = state.max || hi; render(); syncUrl(); });
    if (root._clickBound) return;                 // re-running buildFilters (language switch) must not stack handlers
    root._clickBound = 1;
    root.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-type]');
      if (chip) {
        var t = chip.getAttribute('data-type');
        state.type = state.type === t ? '' : t;
        GG.$$('[data-type]', root).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-type') === state.type)); });
        state.page = 1; render(); syncUrl(); return;
      }
      if (e.target.closest('[data-reset]')) {
        state = { q: '', division: '', district: '', type: '', min: 0, max: 0, days: '', rating: 0, sort: state.sort, page: 1, per: 24 };
        buildFilters(); render(); syncUrl();
      }
    });
  }

  /* -------------------------------------------------------------- results */
  function render() {
    var host = GG.$('#js-results');
    if (!host) return;
    var rows = sortRows(ALL.filter(matches));
    var shown = rows.slice(0, state.page * state.per);
    host.innerHTML = '';
    var bar = GG.$('#js-result-bar');
    if (bar) {
      bar.innerHTML =
        '<p class="mb-0"><b>' + rows.length + '</b> ' + GG.lang.t('search.found', 'places match') +
        (state.division ? ' &middot; ' + GG.esc(state.division) : '') +
        (state.type ? ' &middot; ' + GG.esc(state.type) : '') +
        (state.q ? ' &middot; &ldquo;' + GG.esc(state.q) + '&rdquo;' : '') + '</p>' +
        '<div class="field" style="min-width:200px"><label for="f-sort">' + GG.lang.t('search.sort', 'Sort by') + '</label>' +
        '<select id="f-sort">' + (state.q ? [['relevance', 'Best match'], ['popular', 'Most popular']] : [['popular', 'Most popular']])
          .concat([['rating', 'Highest rated'], ['price-asc', 'Price: low to high'],
        ['price-desc', 'Price: high to low'], ['name', 'Name (A-Z)'], ['duration', 'Longest stay']])
          .map(function (o) { return '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
        '</select></div>';
      var sel = GG.$('#f-sort', bar);
      if (sel && !sel._bound) {
        sel._bound = 1;
        GG.on(sel, 'change', function () { state.sort = sel.value; render(); syncUrl(); });
      }
    }
    var grid = GG.el('div', 'grid grid--3');
    shown.forEach(function (r) { grid.appendChild(R.destinationCard(r)); });
    host.appendChild(grid);
    if (!rows.length) host.appendChild(R.empty('No destination matches this combination. Try clearing the price range or the travel type.'));
    var more = GG.$('#js-more');
    if (more) {
      var left = rows.length - shown.length;
      more.hidden = left <= 0;
      more.textContent = 'Show ' + Math.min(state.per, left) + ' more (' + left + ' left)';
      if (!more._bound) {
        more._bound = 1;
        GG.on(more, 'click', function () { state.page++; render(); });
      }
    }
  }

  /* --------------------------------------------------- division index list */
  function renderIndex() {
    var host = GG.$('[data-division-index]');
    if (!host) return;
    var groups = {};
    ALL.forEach(function (r) { (groups[r.division] = groups[r.division] || []).push(r); });
    host.innerHTML = Object.keys(groups).sort().map(function (div) {
      var rows = groups[div];
      var byDistrict = {};
      rows.forEach(function (r) { (byDistrict[r.district] = byDistrict[r.district] || []).push(r); });
      return '<section class="card card--pad" style="margin-bottom:1.2rem">' +
        '<h2 style="font-size:1.4rem">' + GG.esc(div) +
        ' <span class="muted small">(' + rows.length + ' ' + GG.lang.t('index.listed', 'listed') + ')</span></h2>' +
        Object.keys(byDistrict).sort().map(function (dist) {
          return '<h3 style="font-size:1rem;margin:.9rem 0 .3rem">' + GG.esc(dist) + ' <span class="muted small">' +
            GG.lang.t('index.division', 'district') + '</span></h3><ul class="list-check" style="columns:2;gap:1.6rem">' +
            byDistrict[dist].map(function (r) {
              return '<li><a href="' + GG.url('pages/destination-detail.html?id=' + encodeURIComponent(r.id)) + '">' +
                GG.esc(r.name) + '</a>' + (r.name_bn ? ' <span class="muted small">' + GG.esc(r.name_bn) + '</span>' : '') + '</li>';
            }).join('') + '</ul>';
        }).join('') + '</section>';
    }).join('');
  }

  /* ------------------------------------------------------- detail template */
  function renderDetail() {
    var host = GG.$('[data-destination]');
    if (!host) return;
    var id = GG.param('id') || GG.param('destination');
    var rec = ALL.filter(function (r) { return r.id === id || r.slug === id; })[0];
    if (!rec) {
      host.innerHTML = '<div class="card card--pad"><h1>Destination not found</h1>' +
        '<p class="muted">The template reads <code>?id=&lt;slug&gt;</code> from <code>data/destinations.json</code>. ' +
        'Try <a href="' + GG.url('pages/destinations.html') + '">the full list</a>, or open ' +
        '<a href="' + GG.url('pages/destination-detail.html?id=sundarban') + '">Sundarbans</a> as an example.</p></div>';
      return;
    }
    d.title = rec.name + ' | ' + GG.cfg.name;
    var meta = d.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', (rec.short_description || '').slice(0, 158));
    var canonical = d.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', canonical.getAttribute('href').split('?')[0] + '?id=' + rec.id);
    var ld = GG.$('#js-ld-attraction');
    if (ld) {
      ld.textContent = JSON.stringify({
        '@context': 'https://schema.org', '@type': 'TouristAttraction', name: rec.name, alternateName: rec.name_bn,
        description: rec.short_description, address: { '@type': 'PostalAddress', addressLocality: rec.district, addressRegion: rec.division, addressCountry: 'BD' },
        geo: { '@type': 'GeoCoordinates', latitude: rec.latitude, longitude: rec.longitude },
        touristType: (rec.tags || []).join(', '), image: rec.image_remote || '',
        offers: { '@type': 'AggregateOffer', priceCurrency: 'BDT', lowPrice: rec.price_range_min, highPrice: rec.price_range_max, offerCount: 1 },
        aggregateRating: { '@type': 'AggregateRating', ratingValue: GG.util.ratingOf(rec), reviewCount: GG.util.reviewsOf(rec) }
      }, null, 2);
    }
    var imgs = (rec.gallery || []).map(function (g, i) {
      return { src: g.remote || (GG.url('assets/images/destinations/' + rec.id + '.jpg')),
               alt: rec.name + ' - view ' + (i + 1), caption: rec.name };
    });
    if (!imgs.length) imgs.push({ src: GG.img(rec).src, alt: rec.name, caption: rec.name });

    host.innerHTML =
      '<div class="hero hero--compact"><div class="hero__slides"><div class="hero__slide" data-active="true" ' +
        'style="background-image:url(' + (rec.image ? GG.url(rec.image) : GG.poster(rec)) + '),url(' + GG.poster(rec) + ')"></div></div>' +
        '<div class="container hero__inner"><p class="eyebrow">' + GG.esc(rec.division + ' \u00b7 ' + rec.district) + '</p>' +
        '<h1>' + GG.esc(rec.name) + '</h1>' +
        (rec.name_bn ? '<p class="small" lang="bn">' + GG.esc(rec.name_bn) + '</p>' : '') +
        '<p>' + GG.esc(rec.short_description) + '</p>' +
        '<div class="row"><a class="btn btn--accent" href="' + GG.url('pages/booking.html') + '?destination=' + rec.id + '">' +
        GG.lang.t('dest.book', 'Plan this trip') + '</a>' +
        '<a class="btn btn--light" href="' + GG.url('pages/destinations.html') + '">' + GG.lang.t('dest.back', 'All destinations') + '</a></div>' +
        '</div></div>' +
      '<div class="section"><div class="container grid grid--sidebar">' +
        '<div class="stack">' +
          '<div><h2>' + GG.lang.t('dest.about', 'About this place') + '</h2>' +
            (rec.long_description || '').split('\n\n').map(function (para) { return '<p>' + GG.esc(para) + '</p>'; }).join('') + '</div>' +
          '<div><h2>' + GG.lang.t('dest.highlights', 'Highlights') + '</h2>' +
            '<ul class="list-check">' + (rec.highlights || []).map(function (h) { return '<li>' + GG.esc(h) + '</li>'; }).join('') + '</ul></div>' +
          '<div><h2>' + GG.lang.t('dest.gallery', 'Gallery') + '</h2>' +
            '<div class="gallery-grid" data-lightbox>' + imgs.map(function (g, i) {
              return '<button type="button" data-lightbox-item data-full="' + g.src + '" data-alt="' + GG.esc(g.alt) + '" aria-label="Open image ' + (i + 1) + '">' +
                '<img src="' + g.src + '" alt="' + GG.esc(g.alt) + '" loading="lazy" decoding="async" onerror="this.parentNode.style.opacity=.35"></button>';
            }).join('') + '</div>' +
            (rec.video_embed ? '<p class="small"><a href="' + rec.video_embed + '" target="_blank" rel="noopener">' + GG.lang.t('dest.video', 'Watch a preview clip') + '</a></p>' : '') + '</div>' +
          '<div><h2>' + GG.lang.t('dest.itinerary', 'Sample itinerary') + '</h2><div class="itinerary">' +
            (rec.sample_itinerary || []).map(function (s, i) {
              return '<article><span class="day-badge">' + GG.lang.t('dest.day', 'Day') + ' ' + (i + 1) + '</span>' +
                '<h4>' + GG.esc(s.title) + '</h4><p>' + GG.esc(s.detail) + '</p></article>';
            }).join('') + '</div></div>' +
          '<div><h2>' + GG.lang.t('dest.map', 'Map & directions') + '</h2><div class="map-box" id="js-map" role="img" ' +
            'aria-label="Map showing ' + GG.esc(rec.name) + '"></div></div>' +
          '<div><h2>' + GG.lang.t('dest.packages', 'Tours that include ' + rec.name) + '</h2><div class="grid grid--2" id="js-related-packages"></div></div>' +
        '</div>' +
        '<aside class="stack">' +
          '<div class="card card--pad"><h3 style="margin-top:0">' + GG.lang.t('dest.quick', 'Trip essentials') + '</h3>' +
            '<dl class="kv" style="grid-template-columns:1fr">' +
            '<div><dt>' + GG.lang.t('dest.best', 'Best time') + '</dt><dd>' + GG.esc(rec.best_time) + '</dd></div>' +
            '<div><dt>' + GG.lang.t('dest.duration', 'Suggested stay') + '</dt><dd>' + GG.fmt.nights(rec.duration_days) + '</dd></div>' +
            '<div><dt>' + GG.lang.t('dest.price', 'Guideline price') + '</dt><dd>' + GG.fmt.money(rec.price_range_min) + ' &ndash; ' + GG.fmt.money(rec.price_range_max) + ' ' + GG.lang.t('dest.pp', 'per person') + '</dd></div>' +
            '<div><dt>' + GG.lang.t('dest.rating', 'Traveller rating') + '</dt><dd><span class="stars">' + GG.util.stars(GG.util.ratingOf(rec)) + '</span> ' + GG.util.ratingOf(rec) + ' (' + GG.util.reviewsOf(rec) + ')</dd></div>' +
            '<div><dt>' + GG.lang.t('dest.coords', 'Coordinates') + '</dt><dd class="small">' + rec.latitude + ', ' + rec.longitude + '</dd></div>' +
            '</dl>' +
            '<a class="btn btn--primary btn--block" href="' + GG.url('pages/booking.html') + '?destination=' + rec.id + '">' + GG.lang.t('dest.book', 'Plan this trip') + '</a>' +
            '<a class="btn btn--ghost btn--block" href="https://wa.me/' + GG.cfg.whatsapp + '?text=' + encodeURIComponent('Hello GHORA GHURI, I would like details about ' + rec.name) + '" target="_blank" rel="noopener">WhatsApp ' + GG.cfg.phone + '</a>' +
            '<p class="hint">' + GG.lang.t('dest.note', 'Prices are indicative per-person package rates in BDT and are confirmed after enquiry.') + '</p>' +
          '</div>' +
          '<div class="card card--pad"><h3 style="margin-top:0">' + GG.lang.t('dest.tags', 'Tags') + '</h3><div class="dest__tags">' +
            (rec.tags || []).map(function (t) { return '<a class="badge" href="' + GG.url('pages/destinations.html?type=' + encodeURIComponent(t)) + '">' + GG.esc(t) + '</a>'; }).join(' ') +
            '</div></div>' +
          '<div class="card card--pad"><h3 style="margin-top:0">' + GG.lang.t('dest.why', 'Why book with GHORA GHURI') + '</h3>' +
            '<ul class="list-check small mb-0"><li>Licensed local guides in every division</li><li>Boat and permit handling for the Sundarbans belt</li>' +
            '<li>Fixed price in BDT, no hidden fuel surcharge</li><li>Owner-direct support on ' + GG.cfg.phone + '</li></ul></div>' +
        '</div>' +
      '</div></div>';

    R.map(GG.$('#js-map'), rec, { zoom: 10 });
    var rel = GG.$('#js-related-packages');
    if (rel) {
      var pk = PACKAGES.filter(function (p) { return (p.destination_ids || []).indexOf(rec.id) > -1; });
      if (!pk.length) {
        pk = PACKAGES.filter(function (p) {
          return (p.title + ' ' + (p.stops || []).join(' ')).toLowerCase().indexOf(rec.district.toLowerCase()) > -1;
        });
      }
      pk.slice(0, 4).forEach(function (p) { rel.appendChild(R.packageCard(p)); });
      if (!pk.length) rel.appendChild(R.empty('No package includes this stop yet - ask for a custom private tour.'));
    }
  }

  /* ---------------------------------------------------------- home widgets */
  function renderHome() {
    var feat = GG.$('[data-featured-destinations]');
    if (feat) {
      var picks = ALL.filter(function (r) { return r.featured; });
      if (picks.length < 8) {
        picks = sortRows(ALL.filter(function (r) { return r.tags.indexOf('beach') > -1 || r.tags.indexOf('heritage') > -1 || r.tags.indexOf('wildlife') > -1; })).slice(0, 10);
      }
      var track = GG.$('.carousel__track', feat) || feat;
      track.innerHTML = '';
      picks.slice(0, 10).forEach(function (r) {
        var cell = GG.el('div'); cell.setAttribute('role', 'listitem');
        cell.appendChild(R.destinationCard(r, { small: true }));
        track.appendChild(cell);
      });
    }
    var quick = GG.$('#js-quick-divisions');
    if (quick) {
      quick.innerHTML = divisions().map(function (o) {
        return '<a class="card card--pad center" href="' + GG.url('pages/destinations.html?division=' + encodeURIComponent(o.name)) + '" data-reveal>' +
          '<b style="font-family:var(--serif);font-size:1.2rem">' + GG.esc(o.name) + '</b>' +
          '<span class="muted small">' + o.count + ' ' + GG.lang.t('home.places', 'places') + '</span></a>';
      }).join('');
    }
    var popular = GG.$('[data-quick-destinations]');
    if (popular) {
      var names = ['Cox\'s Bazar Sea Beach', 'The Sundarbans', 'Srimangal Tea Country', 'St. Martin\'s Island', 'Kuakata Beach', 'Paharpur Vihara'];
      var opts = ALL.filter(function (r) { return names.indexOf(r.name) > -1; });
      GG.on(popular, 'change', function () {
        var q = GG.$('#f-q');
        if (q) { q.value = popular.options[popular.selectedIndex].text; state.q = popular.value; render(); syncUrl(); }
        else if (popular.value) w.location.href = GG.url('pages/destination-detail.html?id=' + encodeURIComponent(popular.value));
      });
    }
  }

  /* -------------------------------------------------------------- bootstrap */
  function start() {
    GG.store.all().then(function (data) {
      ALL = data.destinations || [];
      PACKAGES = data.packages || [];
      buildFilters();
      if (GG.$('#js-results')) render();
      renderIndex();
      renderDetail();
      renderHome();
      w.GG.destinations = ALL;
      w.GG.packages = PACKAGES;
      GG.util.dispatch('gg:data', data);
      /* language switch: re-render JS-built blocks so record names follow the locale */
      d.addEventListener('gg:lang', function () {
        var focused = d.activeElement && d.activeElement.id;
        buildFilters();                       // translates the filter labels
        if (focused) { var re = GG.$('#' + focused); re && re.focus(); }
        if (GG.$('#js-results')) render();
        renderIndex(); renderDetail(); renderHome();
      });
    }).catch(function (err) {
      var host = GG.$('#js-results') || GG.$('[data-destination]');
      if (host) {
        host.innerHTML = '<div class="card card--pad"><h1>Could not load the destination database</h1>' +
          '<p class="muted">' + GG.esc(err.message) + '. Serve the folder over HTTP (python3 -m http.server) ' +
          'or open <code>index.preview.html</code> at the package root, which carries the data inline.</p></div>';
      }
    });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();
})(window, document);
