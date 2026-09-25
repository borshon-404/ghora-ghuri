/* ==========================================================================
   GHORA GHURI - content.js
   Package listing/detail rendering, the journal (blog) list and article view,
   and the hero quick-search wiring. Data comes from data/packages.json and
   data/blog.json through the same GG.data.load() path as destinations.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var GG = w.GG;
  var packages = [], posts = [], dests = [];
  var TYPE = { all: 'All trips', beach: 'Beach & islands', heritage: 'Heritage', eco: 'Eco & forest',
    hill: 'Hills & trekking', city: 'City & food', river: 'River & haor', pilgrimage: 'Pilgrimage' };

  function T(key, en) { return GG.lang.t(key, en); }

  /* ------------------------------------------------------------- home grid */
  function renderFeaturedPackages() {
    var nodes = GG.$$('[data-packages]');
    if (!nodes.length) return;
    nodes.forEach(function (host) {
      var limit = Number(host.getAttribute('data-packages-limit')) || 6;
      var rows = packages.filter(function (p) { return p.featured !== false; }).slice(0, limit);
      host.innerHTML = '';
      rows.forEach(function (p) { host.appendChild(GG.render.packageCard(p)); });
      if (!rows.length) host.appendChild(GG.render.empty('No packages yet - add them in data/packages.json.'));
    });
  }

  /* -------------------------------------------------------- packages page */
  var pkgState = { q: '', type: (GG.param('tag') || 'all') };

  function matchesPkg(p) {
    if (pkgState.type !== 'all' && (p.tags || []).indexOf(pkgState.type) === -1) return false;
    if (!pkgState.q) return true;
    var hay = [p.title, p.summary, p.division, (p.stops || []).join(' '), (p.tags || []).join(' ')].join(' ').toLowerCase();
    return pkgState.q.toLowerCase().split(/\s+/).every(function (t) { return hay.indexOf(t) > -1; });
  }

  function renderPkgChips() {
    var host = GG.$('#js-pkg-types');
    if (!host) return;
    host.innerHTML = Object.keys(TYPE).map(function (k) {
      var n = k === 'all' ? packages.length : packages.filter(function (p) { return (p.tags || []).indexOf(k) > -1; }).length;
      if (!n && k !== 'all') return '';
      return '<button type="button" class="chip' + (pkgState.type === k ? ' is-on' : '') + '" data-pkg-type="' + k +
        '" aria-pressed="' + (pkgState.type === k) + '">' + TYPE[k] + ' <span>' + n + '</span></button>';
    }).join('');
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pkg-type]');
      if (!b) return;
      pkgState.type = b.getAttribute('data-pkg-type');
      renderPkgChips(); renderPkgs();
    });
  }

  function renderPkgs() {
    var host = GG.$('#js-packages');
    if (!host) return;
    var rows = packages.filter(matchesPkg);
    host.innerHTML = '';
    rows.forEach(function (p) { host.appendChild(GG.render.packageCard(p)); });
    if (!rows.length) host.appendChild(GG.render.empty('No package matches that search. Try "Sundarban", "beach" or "heritage".'));
    var note = GG.$('#js-pkg-count');
    if (note) note.textContent = rows.length + ' of ' + packages.length + ' packages';
  }

  /* --------------------------------------------------- package detail page */
  function renderPackageDetail() {
    var host = GG.$('[data-package]');
    if (!host) return;
    var id = GG.param('id');
    var p = packages.filter(function (x) { return x.id === id; })[0];
    if (!p) { host.innerHTML = ''; host.appendChild(GG.render.empty('No package with id "' + (id || '') + '". <a href="packages.html">Back to all packages</a>')); return; }
    var linked = (p.destination_ids || []).map(function (did) {
      return dests.filter(function (r) { return r.id === did; })[0];
    }).filter(Boolean);

    host.innerHTML =
      '<div class="hero hero--compact" style="background-image:url(' + GG.img(p, false).src + ')">' +
        '<div class="container hero__inner"><p class="eyebrow">' + GG.esc(p.division || 'Bangladesh') + '</p>' +
        '<h1>' + GG.esc(GG.render.localName(p)) + '</h1>' +
        '<p>' + GG.esc(p.summary) + '</p>' +
        '<div class="hero__cta"><a class="btn btn--accent" href="' + GG.url('pages/booking.html') + '?package=' + encodeURIComponent(p.id) + '">' +
        T('pkg.book', 'Book this trip') + '</a>' +
        '<a class="btn btn--light" href="' + GG.url('pages/packages.html') + '">All packages</a></div></div></div>' +

      '<div class="container section"><div class="grid grid--sidebar"><div class="prose">' +
        '<h2>' + T('pkg.day', 'Day by day') + '</h2>' +
        '<ol class="itinerary">' + (p.itinerary || []).map(function (it) {
          return '<li><b>Day ' + GG.esc(it.title) + '</b><p class="mb-0">' + GG.esc(it.detail) + '</p></li>';
        }).join('') + '</ol>' +

        '<h2>' + T('pkg.stops', 'Places on this route') + '</h2>' +
        '<div class="grid grid--2" id="js-pkg-dest"></div>' +

        '<div class="grid grid--2" style="margin-top:1.6rem">' +
          '<div class="card card--pad"><h3 style="margin-top:0">' + T('pkg.incl', 'What is included') + '</h3><ul class="list-check small mb-0">' +
            (p.included || []).map(function (x) { return '<li>' + GG.esc(x) + '</li>'; }).join('') + '</ul></div>' +
          '<div class="card card--pad"><h3 style="margin-top:0">' + T('pkg.excl', 'Not included') + '</h3><ul class="list-check small mb-0">' +
            (p.excluded || []).map(function (x) { return '<li>' + GG.esc(x) + '</li>'; }).join('') + '</ul></div>' +
        '</div>' +

        (p.departure_dates && p.departure_dates.length
          ? '<h2>' + T('pkg.dates', 'Departure dates') + '</h2><div class="table-wrap"><table class="table"><thead><tr>' +
            '<th>Date</th><th>Seats left</th><th>Price pp</th><th></th></tr></thead><tbody>' +
            p.departure_dates.map(function (row) {
              return '<tr><td>' + GG.fmt.date(row.date) + '</td><td>' + (row.seats > 4 ? row.seats : '<b style="color:var(--accent)">' + row.seats + '</b>') +
                '</td><td>' + GG.fmt.money(row.price) + '</td><td><a class="btn btn--ghost btn--sm" href="' +
                GG.url('pages/booking.html') + '?package=' + encodeURIComponent(p.id) + '&depart=' + row.date + '">Request</a></td></tr>';
            }).join('') + '</tbody></table></div>' : '') +
      '</div>' +

      '<aside>' +
        '<div class="card card--pad" style="position:sticky;top:86px">' +
          '<p class="eyebrow">' + T('pkg.from', 'From') + '</p>' +
          '<p class="price-tag" style="font-size:2rem">' + GG.fmt.money(p.price_min) + ' <small>' + T('pkg.perPerson', 'per person') + '</small></p>' +
          '<div class="kv" style="grid-template-columns:auto 1fr">' +
            '<b>' + T('pkg.len', 'Length') + '</b><span>' + p.duration_days + ' days / ' + p.nights + ' nights</span>' +
            '<b>' + T('pkg.group', 'Group') + '</b><span>' + GG.esc(p.group_size || '2 - 18') + '</span>' +
            '<b>' + T('pkg.lang', 'Guiding') + '</b><span>' + (p.languages || 'Bangla, English') + '</span>' +
            '<b>' + T('pkg.meal', 'Meals') + '</b><span>' + (p.meals || 'Breakfast + dinner') + '</span>' +
            '<b>' + T('pkg.rating', 'Rating') + '</b><span>' + GG.util.stars(p.rating || 4.7) + ' <span class="muted small">' +
              (p.reviews ? p.reviews + ' reviews' : '') + '</span></span>' +
          '</div>' +
          '<a class="btn btn--accent btn--block" style="margin-top:.8rem" href="' + GG.url('pages/booking.html') + '?package=' + encodeURIComponent(p.id) + '">' +
            T('pkg.book', 'Book this trip') + '</a>' +
          '<a class="btn btn--whatsapp btn--block" style="margin-top:.5rem" href="https://wa.me/8801330132141?text=' +
            encodeURIComponent('Hello GHORA GHURI, I would like ' + p.title + ' (' + p.id + ')') + '">Ask on WhatsApp</a>' +
          '<p class="hint mb-0">' + T('pkg.disclaimer', 'Prices are per person in BDT, twin sharing, including VAT. Solo supplement and peak-season changes are confirmed in the written quote.') + '</p>' +
        '</div>' +
        (linked.length ? '<div class="card card--pad" style="margin-top:1.2rem"><h3 style="margin-top:0">' +
          T('pkg.onroute', 'On this route') + '</h3><ul class="list-check small mb-0">' +
          linked.map(function (r) {
            return '<li><a href="' + GG.url('pages/destination-detail.html') + '?id=' + encodeURIComponent(r.id) + '">' +
              GG.esc(GG.render.localShort(r)) + '</a> <span class="muted">' + GG.esc(r.district) + '</span></li>';
          }).join('') + '</ul></div>' : '') +
      '</aside></div></div>';

    var grid = GG.$('#js-pkg-dest', host);
    linked.slice(0, 8).forEach(function (r) { grid.appendChild(GG.render.destinationCard(r, { wide: false })); });

    var ld = {
      '@context': 'https://schema.org', '@type': 'TouristTrip', name: p.title, description: p.summary,
      touristType: (p.tags || []).join(', '),
      itinerary: { '@type': 'ItemList', itemListElement: (p.itinerary || []).map(function (it, i) {
        return { '@type': 'ListItem', position: i + 1, name: it.title, itemListElement: { '@type': 'TouristAttraction', name: it.detail } }; }) },
      offers: { '@type': 'Offer', price: p.price_min, priceCurrency: 'BDT', availability: 'https://schema.org/InStock', url: w.location.href }
    };
    var s = d.getElementById('js-ld-trip');
    if (!s) { s = GG.el('script'); s.id = 'js-ld-trip'; s.type = 'application/ld+json'; d.head.appendChild(s); }
    s.textContent = JSON.stringify(ld);
    d.title = p.title + ' - GHORA GHURI';
  }

  /* ------------------------------------------------------------ blog list */
  function cardFor(post) {
    var a = GG.el('article', 'card card--pad');
    a.setAttribute('data-reveal', '');
    var img = post.image && dests.filter(function (r) { return r.id === post.image; })[0];
    a.innerHTML =
      '<div class="thumb" style="background-image:url(' + (img ? GG.img(img, true).src : GG.poster({ id: post.id, name: post.title, district: post.tag, division: 'Bangladesh', tags: ['photography'] })) + ');background-size:cover"></div>' +
      '<h3 style="margin:.9rem 0 .3rem;font-size:1.15rem"><a href="' + GG.url('pages/blog-post.html') + '?id=' + encodeURIComponent(post.id) + '">' +
        GG.esc(post.title) + '</a></h3>' +
      '<p class="small muted mb-2">' + GG.fmt.date(post.date) + ' &middot; ' + GG.esc(post.author) + ' &middot; ' +
        post.read_minutes + ' min &middot; <span class="badge">' + GG.esc(post.tag) + '</span></p>' +
      '<p class="small">' + GG.esc(post.excerpt) + '</p>' +
      '<p class="mb-0"><a class="btn btn--ghost btn--sm" href="' + GG.url('pages/blog-post.html') + '?id=' + encodeURIComponent(post.id) + '">Read note</a></p>';
    return a;
  }

  function renderBlog(limitHost) {
    var hosts = GG.$$('[data-blog-list], #js-blog-list');
    if (!hosts.length) return;
    hosts.forEach(function (host) {
      var limit = Number(host.getAttribute('data-blog-limit')) || posts.length;
      host.innerHTML = '';
      posts.slice(0, limit).forEach(function (p) { host.appendChild(cardFor(p)); });
    });
  }

  function renderPost() {
    var host = GG.$('[data-blog-post]');
    if (!host) return;
    var p = posts.filter(function (x) { return x.id === GG.param('id'); })[0] || posts[0];
    if (!p) { host.innerHTML = '<p class="muted">No articles yet.</p>'; return; }
    host.innerHTML =
      '<div class="container section" style="max-width:820px">' +
        '<nav class="small muted" aria-label="Breadcrumb"><a href="' + GG.url('index.html') + '">Home</a> &rsaquo; ' +
        '<a href="' + GG.url('pages/blog.html') + '">Journal</a> &rsaquo; <span>' + GG.esc(p.tag) + '</span></nav>' +
        '<p class="eyebrow">' + GG.esc(p.tag) + '</p>' +
        '<h1>' + GG.esc(p.title) + '</h1>' +
        '<p class="muted small">' + GG.fmt.date(p.date) + ' &middot; ' + GG.esc(p.author) + ' &middot; ' + p.read_minutes + ' min read</p>' +
        '<div class="thumb" style="aspect-ratio:16/7;border-radius:var(--r-lg);margin:1.2rem 0;background-image:url(' +
          GG.url('assets/images/destinations/' + (p.image || 'sundarbans') + '.jpg') + ');background-size:cover;background-position:center"></div>' +
        '<div class="prose">' + (p.body || []).map(function (b) {
          return b.h ? '<h2>' + GG.esc(b.h) + '</h2>' : '<p>' + GG.esc(b.p) + '</p>';
        }).join('') + '</div>' +
        (p.related && p.related.length ? '<h2 style="font-size:1.2rem">Related destinations</h2><div class="grid grid--3" id="js-post-rel"></div>' : '') +
        '<div class="card card--pad" style="margin-top:2rem"><div class="row row--between" style="align-items:center;gap:1rem;flex-wrap:wrap">' +
        '<div><b>Planning this route?</b><p class="muted small mb-0">We will send the current permit status and a taka quote with it.</p></div>' +
        '<a class="btn btn--primary" href="' + GG.url('pages/booking.html') + '">Start a request</a></div></div>' +
      '</div>';
    var rel = GG.$('#js-post-rel', host);
    if (rel) (p.related || []).forEach(function (id) {
      var r = dests.filter(function (x) { return x.id === id; })[0];
      if (r) rel.appendChild(GG.render.destinationCard(r, {}));
    });
    var other = posts.filter(function (x) { return x.id !== p.id; }).slice(0, 3);
    var foot = GG.el('div', 'container section');
    foot.innerHTML = '<h2 style="font-size:1.2rem">More field notes</h2>';
    var grid = GG.el('div', 'grid grid--3');
    other.forEach(function (o) { grid.appendChild(cardFor(o)); });
    foot.appendChild(grid);
    host.appendChild(foot);
  }

  /* ------------------------------------------------------- hero quicksearch */
  function wireHeroSearch() {
    var f = GG.$('#js-hero-search');
    if (!f) return;
    GG.on(GG.$('[data-hero-book]', f), 'click', function () {
      var q = GG.$('#q', f).value.trim(), dv = GG.$('#division', f).value, dt = GG.$('#depart', f).value;
      var hit = dests.filter(function (r) { return q && r.name.toLowerCase().indexOf(q.toLowerCase()) === 0; })[0];
      var u = GG.url('pages/booking.html') + '?';
      if (hit) u += 'destination=' + encodeURIComponent(hit.id) + '&';
      if (dt) u += 'depart=' + encodeURIComponent(dt) + '&';
      if (q && !hit) u += 'q=' + encodeURIComponent(q) + '&';
      w.location.href = u.replace(/&$/, '');
    });
    var inp = GG.$('#q', f);
    if (!inp) return;
    var list = GG.el('datalist'); list.id = 'js-dest-suggest';
    list.innerHTML = dests.map(function (r) {
      return '<option value="' + GG.attr(r.name) + '">' + GG.attr(r.district + ', ' + r.division) + '</option>';
    }).join('');
    d.body.appendChild(list);
    inp.setAttribute('list', 'js-dest-suggest');
  }

  /* --------------------------------------------------------------- boot */
  function boot() {
    Promise.all([GG.store.get('packages'), GG.data.load('packages'), GG.store.get('destinations'), GG.data.load('destinations')])
      .then(function (r) {
        packages = (r[0] && r[0].length ? r[0] : r[1]) || [];
        dests = (r[2] && r[2].length ? r[2] : r[3]) || [];
        return GG.data.load('blog').catch(function () { return []; }).then(function (b) {
          posts = b || [];
          renderFeaturedPackages();
          renderPkgChips(); renderPkgs();
          renderPackageDetail();
          renderBlog(); renderPost();
          wireHeroSearch();
          var q = GG.$('#pkg-q');
          if (q) {
            GG.on(q, 'input', GG.util.debounce(function () { pkgState.q = q.value; renderPkgs(); }, 180));
            q.value = pkgState.q;
          }
          if (w.prism && w.prism.highlightAll) w.prism.highlightAll();
          GG.util.dispatch('gg:content', { packages: packages.length, posts: posts.length });
          d.addEventListener('gg:lang', function () {
            renderFeaturedPackages(); renderPkgChips(); renderPkgs(); renderPackageDetail(); renderBlog(); renderPost();
          });
        });
      });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
