/* ==========================================================================
   GHORA GHURI - main.js
   Shared behaviour: navigation, language toggle, hero slider, carousels,
   scroll reveal, lightbox gallery, Leaflet/Google/static maps, cookie
   consent, contact form, and the card renderers reused by every page.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var GG = w.GG;

  /* ------------------------------------------------------------ render API */
  var R = GG.render = {};

  R.destinationCard = function (rec, opts) {
    opts = opts || {};
    var img = GG.img(rec, opts.small);
    var div = GG.el('article', 'card dest' + (opts.wide ? ' dest--wide' : ''));
    div.setAttribute('data-tags', (rec.tags || []).join(' '));
    div.innerHTML =
      '<div class="thumb" style="background-image:url(' + GG.poster(rec) + ');background-size:cover">' +
        '<img src="' + img.src + '" alt="' + GG.esc(rec.name + ' - ' + rec.district + ', ' + rec.division) +
        '" loading="lazy" decoding="async" onerror="this.remove()">' +
        '<span class="thumb__flag">' + GG.esc(rec.division) + '</span>' +
      '</div>' +
      '<div class="dest__body">' +
        '<h3 class="dest__title"><a href="' + GG.url('pages/destination-detail.html?id=' + encodeURIComponent(rec.id)) + '">' + GG.esc(localName(rec)) + '</a></h3>' +
        '<p class="dest__meta"><span>' + GG.esc(rec.district) + '</span>' +
          '<span class="stars">' + GG.util.stars(GG.util.ratingOf(rec)) + ' <span>' + GG.util.reviewsOf(rec) + '</span></span></p>' +
        (opts.wide ? '' : '<p class="small">' + GG.esc(localShort(rec)) + '</p>') +
        '<div class="dest__tags">' + (rec.tags || []).slice(0, 4).map(function (t) {
          return '<span class="badge">' + GG.esc(t) + '</span>';
        }).join('') + '</div>' +
        '<div class="pkg__foot">' +
          '<span class="price-tag">' + fromTo(rec) + '</span>' +
          '<a class="btn btn--ghost btn--sm" href="' + GG.url('pages/destination-detail.html?id=' + encodeURIComponent(rec.id)) + '">' +
          GG.lang.t('dest.details', 'Details') + '</a>' +
        '</div>' +
      '</div>';
    return div;
  };

  function fromTo(rec) {
    var lo = Number(rec.price_range_min) || 0, hi = Number(rec.price_range_max) || 0;
    if (!lo && !hi) return '<span class="muted small">' + GG.lang.t('dest.onrequest', 'Price on request') + '</span>';
    if (lo && !hi) return 'from ' + GG.fmt.money(lo);
    return GG.fmt.money(lo) + ' &ndash; ' + GG.fmt.money(hi);
  }
  function localName(rec) {
    if (GG.lang.get() === 'bn' && (rec.name_bn || rec.title_bn)) return rec.name_bn || rec.title_bn;
    return rec.name || rec.title || '';
  }
  function localShort(rec) {
    if (GG.lang.get() === 'bn' && rec.short_bn) return rec.short_bn;
    var src = rec.short_description || rec.summary || '';
    return src ? src.split('. ')[0] + '.' : '';
  }
  R.localName = localName;
  R.localShort = localShort;

  R.packageCard = function (p) {
    var rec = p.destination_ids && p.destination_ids[0];
    var img = p.image ? { src: GG.url(p.image) } : null;
    var card = GG.el('article', 'card pkg');
    card.innerHTML =
      '<div class="thumb" style="background-image:url(' + posterForPkg(p) + ');background-size:cover">' +
        (img ? '<img src="' + img.src + '" alt="' + GG.esc(p.title) + '" loading="lazy" onerror="this.remove()">' : '') +
        (p.badge ? '<span class="thumb__flag">' + GG.esc(p.badge) + '</span>' : '') +
      '</div>' +
      '<div class="pkg__body">' +
        '<h3 class="pkg__title"><a href="' + GG.url('pages/package-detail.html?id=' + encodeURIComponent(p.id)) + '">' + GG.esc(p.title) + '</a></h3>' +
        '<p class="pkg__meta">' +
          '<span>&#128337; ' + p.duration_days + (p.duration_days === 1 ? ' day' : ' days') + (p.nights ? ' / ' + p.nights + ' nights' : '') + '</span>' +
          '<span>&#128205; ' + (p.stops ? p.stops.length : 1) + ' stops</span>' +
          '<span class="stars">' + GG.util.stars(p.rating || 4.7) + '</span>' +
        '</p>' +
        '<p class="small">' + GG.esc(p.summary) + '</p>' +
        '<div class="dest__tags">' + (p.tags || []).slice(0, 3).map(function (t) {
          return '<span class="badge">' + GG.esc(t) + '</span>';
        }).join(' ') + '</div>' +
        '<div class="pkg__foot">' +
          '<span class="price-tag"><small>' + GG.lang.t('pkg.perPerson', 'per person') + '</small>' +
          GG.fmt.money(p.price_min) + (p.price_max > p.price_min ? ' &ndash; ' + GG.fmt.money(p.price_max) : '') + '</span>' +
          '<a class="btn btn--primary btn--sm" href="' + GG.url('pages/booking.html') + '?package=' + encodeURIComponent(p.id) + '">' +
          GG.lang.t('pkg.book', 'Book now') + '</a>' +
        '</div>' +
      '</div>';
    return card;
  };

  function posterForPkg(p) {
    return GG.poster({ id: p.id, name: p.title, district: p.stops && p.stops[0], division: p.division || 'Bangladesh', tags: p.tags });
  }

  R.empty = function (msg) {
    var n = GG.el('div', 'card card--pad center muted');
    n.innerHTML = '<p class="mb-0">' + GG.esc(msg || 'Nothing matched those filters.') + '</p>';
    return n;
  };

  /* ------------------------------------------------------------ i18n boot */
  function initLang() {
    var initial = GG.lang.get();
    var buttons = GG.$$('[data-lang]');
    function setPressed(lang) {
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    }
    buttons.forEach(function (b) {
      GG.on(b, 'click', function () {
        var lang = b.getAttribute('data-lang');
        GG.lang.load(lang).then(function () {
          GG.lang.apply(lang);
          setPressed(lang);
          GG.util.dispatch('gg:lang', { lang: lang });
        });
      });
    });
    if (initial !== 'en') {
      GG.lang.load(initial).then(function () { GG.lang.apply(initial); setPressed(initial); });
    } else { setPressed('en'); }
  }

  /* -------------------------------------------------------------- nav/menu */
  function initNav() {
    var burger = GG.$('[data-burger], .burger'), nav = GG.$('#primary-nav');
    if (burger && nav) {
      GG.on(burger, 'click', function () {
        var open = nav.getAttribute('data-open') === 'true';
        nav.setAttribute('data-open', String(!open));
        burger.setAttribute('aria-expanded', String(!open));
      });
      GG.$$('a', nav).forEach(function (a) {
        GG.on(a, 'click', function () { nav.setAttribute('data-open', 'false'); burger.setAttribute('aria-expanded', 'false'); });
      });
    }
    var here = (w.location.pathname.split('/').pop() || 'index.html');
    GG.$$('#primary-nav a[href]').forEach(function (a) {
      var file = a.getAttribute('href').split('/').pop().split('?')[0];
      if (file === here) a.setAttribute('aria-current', 'page');
    });
    var yr = GG.$('[data-year]');
    if (yr) yr.textContent = new Date().getFullYear();
  }

  /* ----------------------------------------------------------- hero slider */
  function initHero() {
    var hero = GG.$('[data-hero]');
    if (!hero) return;
    var slides = GG.$$('.hero__slide', hero);
    if (!slides.length) return;
    var i = 0, timer = null, delay = Number(hero.getAttribute('data-interval')) || 6500;
    function show(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.setAttribute('data-active', String(k === i)); });
      GG.$$('.hero__dots button', hero).forEach(function (b, k) {
        b.setAttribute('aria-current', String(k === i));
      });
    }
    function next() { show(i + 1); }
    var dots = GG.$('.hero__dots', hero);
    if (dots) {
      dots.innerHTML = slides.map(function (_, k) {
        return '<button type="button" data-go="' + k + '" aria-label="' + (k + 1) + '"></button>';
      }).join('');
      GG.on(dots, 'click', function (e) {
        var b = e.target.closest('[data-go]');
        if (b) { stop(); show(Number(b.getAttribute('data-go'))); start(); }
      });
    }
    function start() { if (!w.matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(next, delay); }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    GG.on(GG.$('[data-hero-next]', hero), 'click', function () { stop(); next(); start(); });
    GG.on(GG.$('[data-hero-prev]', hero), 'click', function () { stop(); show(i - 1); start(); });
    GG.on(hero, 'mouseenter', stop);
    GG.on(hero, 'mouseleave', start);
    d.addEventListener('visibilitychange', function () { d.hidden ? stop() : start(); });
    show(0); start();
  }

  /* -------------------------------------------------------------- carousel */
  function initCarousels() {
    GG.$$('[data-carousel]').forEach(function (root) {
      var track = GG.$('.carousel__track', root);
      if (!track) return;
      var btns = GG.$('.carousel__btns', root);
      if (btns) {
        GG.on(GG.$('[data-dir="prev"]', btns), 'click', function () { scroll(-1); });
        GG.on(GG.$('[data-dir="next"]', btns), 'click', function () { scroll(1); });
      }
      function scroll(dir) {
        var step = Math.max(260, track.clientWidth * 0.8) * dir;
        track.scrollBy({ left: step, behavior: w.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      track.setAttribute('tabindex', '0');
      track.setAttribute('role', 'list');
      track.setAttribute('aria-label', 'carousel');
    });
  }

  /* ------------------------------------------------------------- reveal fx */
  function initReveal() {
    var items = GG.$$('[data-reveal]');
    if (!items.length || !('IntersectionObserver' in w)) {
      items.forEach(function (n) { n.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ------------------------------------------------------------- lightbox  */
  function initLightbox() {
    var box = GG.$('#js-lightbox');
    if (!box) {
      box = GG.el('div', 'lightbox');
      box.id = 'js-lightbox';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Image viewer');
      box.hidden = true;
      box.innerHTML =
        '<button class="lb-btn lb-close" type="button" aria-label="Close image viewer">&#10005;</button>' +
        '<button class="lb-btn lb-prev" type="button" aria-label="Previous image">&#8249;</button>' +
        '<figure><img alt=""><figcaption></figcaption></figure>' +
        '<button class="lb-btn lb-next" type="button" aria-label="Next image">&#8250;</button>';
      d.body.appendChild(box);
    }
    var idx = 0, list = [];
    function open(items, n) {
      list = items; idx = n;
      paint(); box.hidden = false;
      d.documentElement.style.overflow = 'hidden';
      box.focus();
    }
    function paint() {
      if (!list.length) return;
      var it = list[idx];
      GG.$('img', box).src = it.src;
      GG.$('img', box).alt = it.alt || '';
      GG.$('figcaption', box).textContent = (it.caption || '') + '  (' + (idx + 1) + '/' + list.length + ')';
    }
    function close() { box.hidden = true; d.documentElement.style.overflow = ''; }
    GG.on(GG.$('.lb-close', box), 'click', close);
    GG.on(GG.$('.lb-prev', box), 'click', function () { idx = (idx - 1 + list.length) % list.length; paint(); });
    GG.on(GG.$('.lb-next', box), 'click', function () { idx = (idx + 1) % list.length; paint(); });
    GG.on(box, 'click', function (e) { if (e.target === box) close(); });
    d.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') { idx = (idx - 1 + list.length) % list.length; paint(); }
      if (e.key === 'ArrowRight') { idx = (idx + 1) % list.length; paint(); }
    });
    GG.lightbox = { open: open };
    d.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lightbox-item]');
      if (!btn) return;
      e.preventDefault();
      var group = btn.closest('[data-lightbox]');
      var nodes = GG.$$('[data-lightbox-item]', group || d);
      var items = nodes.map(function (n) {
        return { src: n.getAttribute('data-full') || n.getAttribute('data-src') || n.src,
                 alt: n.getAttribute('data-alt') || (n.querySelector('img') && n.querySelector('img').alt) || '',
                 caption: n.getAttribute('data-caption') || '' };
      });
      open(items, nodes.indexOf(btn));
    });
  }

  /* ------------------------------------------------------------------ maps */
  R.map = function (node, rec, opts) {
    if (!node || !rec) return;
    opts = opts || {};
    var lat = Number(rec.latitude), lon = Number(rec.longitude);
    if (!isFinite(lat) || !isFinite(lon)) { node.innerHTML = '<p class="muted center">No coordinates recorded.</p>'; return; }
    var engine = GG.cfg.mapEngine;
    if (engine === 'leaflet' && w.L) {
      var map = w.L.map(node, { scrollWheelZoom: false }).setView([lat, lon], opts.zoom || 9);
      w.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      w.L.marker([lat, lon]).addTo(map)
        .bindPopup('<b>' + GG.esc(rec.name) + '</b><br>' + GG.esc(rec.district + ', ' + rec.division));
      node._ggMap = map;
      return;
    }
    if (engine === 'google' && GG.cfg.googleMapsKey && GG.cfg.googleMapsKey.indexOf('YOUR_') === -1) {
      node.innerHTML = '<iframe title="Map of ' + GG.esc(rec.name) + '" width="100%" height="100%" style="border:0" loading="lazy" ' +
        'src="https://www.google.com/maps?q=' + lat + ',' + lon + '&z=' + (opts.zoom || 11) + '&output=embed&key=' + GG.cfg.googleMapsKey + '"></iframe>';
      return;
    }
    /* Offline static fallback: schematic delta plate with a positioned pin.
       Latitude 20.5-26.5 N and longitude 88.0-92.7 E are mapped to the box. */
    var x = Math.min(98, Math.max(2, (lon - 88.0) / (92.7 - 88.0) * 96 + 2));
    var y = Math.min(96, Math.max(4, 100 - (lat - 20.5) / (26.5 - 20.5) * 96));
    node.innerHTML =
      '<div class="map-fallback"><svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%" role="img" ' +
      'aria-label="Schematic map of Bangladesh with a marker for ' + GG.esc(rec.name) + '">' +
      '<rect width="100" height="100" fill="#e6f3ec"/>' +
      '<path d="M8 4 L44 2 L52 16 L74 20 L88 34 L80 52 L86 70 L70 88 L48 82 L30 92 L18 72 L26 52 L12 40 Z" fill="#c9e8d8" stroke="#7ab894" stroke-width="1"/>' +
      '<path d="M30 34 q10 8 4 18 t8 14" fill="none" stroke="#7fb6d6" stroke-width="1.6"/>' +
      '<path d="M56 30 q-6 12 4 20" fill="none" stroke="#7fb6d6" stroke-width="1.4"/>' +
      '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="3.4" fill="#c8102e" stroke="#fff" stroke-width="1.1"/>' +
      '<text x="' + Math.min(80, x + 4.5).toFixed(1) + '" y="' + Math.max(8, y - 3).toFixed(1) + '" font-size="4.4" fill="#0b241c">' + GG.esc(rec.name.slice(0, 24)) + '</text>' +
      '</svg></div>';
    if (node.dataset.cap !== 'off') {
      var p = GG.el('p', 'small muted');
      p.innerHTML = 'Coordinates ' + lat.toFixed(4) + ', ' + lon.toFixed(4) +
        ' &middot; <a href="https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon +
        '" target="_blank" rel="noopener">Open in Google Maps</a> &middot; ' +
        '<a href="https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=12/' + lat + '/' + lon +
        '" target="_blank" rel="noopener">OpenStreetMap</a>';
      node.parentNode.insertBefore(p, node.nextSibling);
    }
  };

  /* --------------------------------------------------- cookie / analytics */
  function initCookie() {
    var bar = GG.$('#js-cookie');
    if (!bar) return;
    var seen = false;
    try { seen = !!w.localStorage.getItem('gg.cookie'); } catch (e) { }
    if (seen) { bar.remove(); return; }
    bar.hidden = false;
    GG.on(GG.$('[data-cookie="accept"]', bar), 'click', function () {
      try { w.localStorage.setItem('gg.cookie', 'all'); } catch (e) { }
      bar.remove(); loadAnalytics();
    });
    GG.on(GG.$('[data-cookie="necessary"]', bar), 'click', function () {
      try { w.localStorage.setItem('gg.cookie', 'necessary'); } catch (e) { }
      bar.remove();
    });
  }
  var analyticsLoaded = false;
  function loadAnalytics() {
    if (analyticsLoaded) return;
    var consent = null;
    try { consent = w.localStorage.getItem('gg.cookie'); } catch (e) { }
    if (consent !== 'all') return;
    analyticsLoaded = true;
    var id = GG.cfg.gaMeasurementId;
    if (id && id.indexOf('XXXX') === -1) {
      var s = d.createElement('script');
      s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
      d.head.appendChild(s);
      w.dataLayer = w.dataLayer || [];
      w.gtag = function () { w.dataLayer.push(arguments); };
      w.gtag('js', new Date()); w.gtag('config', id, { anonymize_ip: true });
    }
    var px = GG.cfg.fbPixelId;
    if (px && px !== '000000000000000') {
      !function (f, b, e, v) { /* facebook pixel bootstrap */
        if (f.fbq) return; var n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        var t = b.createElement(e); t.async = !0; t.src = v; var s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      }(w, d, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      w.fbq && w.fbq('init', px);
    }
  }
  R.analyticsPlaceholder = function () {
    var note = GG.$('[data-analytics-note]');
    if (!note) return;
    var live = GG.cfg.gaMeasurementId.indexOf('XXXX') === -1;
    note.textContent = live
      ? 'GA4 measurement ID ' + GG.cfg.gaMeasurementId + ' is configured.'
      : 'Analytics disabled in the preview: set GG.cfg.gaMeasurementId and FB Pixel id in assets/js/site-data.js (loaded only after consent).';
  };

  /* ------------------------------------------------------------ newsletter */
  function initForms() {
    GG.$$('[data-newsletter]').forEach(function (f) {
      GG.on(f, 'submit', function (e) {
        e.preventDefault();
        var input = GG.$('input[type="email"]', f);
        if (!input || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(input.value)) {
          f.insertAdjacentHTML('beforeend', '<p class="error" role="alert">' + GG.lang.t('err.email', 'Enter a valid email address.') + '</p>');
          return;
        }
        var rows = GG.store.read('gg.subscribers', []);
        rows.push({ email: input.value, at: new Date().toISOString() });
        GG.store.write('gg.subscribers', rows);
        f.reset();
        var done = GG.el('p', 'small');
        done.setAttribute('role', 'status');
        done.textContent = GG.lang.t('form.subscribed', 'Thank you - the newsletter address was saved on this device.');
        f.replaceWith(done);
      });
    });
  }

  /* ------------- generic map boxes: <div data-map data-lat data-lon data-zoom data-label> */
  function initMapBoxes() {
    GG.$$('[data-map]').forEach(function (box) {
      if (box._m) return; box._m = 1;
      R.map(box, {
        name: box.getAttribute('data-label') || 'GHORA GHURI office',
        latitude: Number(box.getAttribute('data-lat')),
        longitude: Number(box.getAttribute('data-lon'))
      }, { zoom: Number(box.getAttribute('data-zoom')) || 12 });
    });
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    initNav(); initLang(); initHero(); initCarousels(); initReveal();
    initLightbox(); initCookie(); initForms(); initMapBoxes(); R.analyticsPlaceholder();
    d.dispatchEvent(new CustomEvent('gg:ready'));
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
