/* ==========================================================================
   GHORA GHURI - bookings.js
   Client-side enquiry/booking engine: validation (bilingual messages),
   price estimate with group + add-on rules, localStorage persistence,
   printable/PDF confirmation voucher, and an optional POST to the API stub.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var GG = w.GG;
  var ADDONS = [
    { id: 'guide-english', label: 'English-speaking guide', price: 2200, per: 'trip' },
    { id: 'photographer', label: 'Tour photographer (2h shoot)', price: 3500, per: 'trip' },
    { id: 'airport', label: 'Airport / rail pickup & drop', price: 1800, per: 'trip' },
    { id: 'insurance', label: 'Travel insurance (per person)', price: 350, per: 'person' },
    { id: 'boat-private', label: 'Private boat upgrade (Sundarban / Kaptai)', price: 6500, per: 'trip' }
  ];
  var PRIVATE_MARKUP = 0.22;      // private-tour multiplier
  var GROUP_TIERS = [[12, 0.10], [6, 0.05]];   // >=12 -> 10%, >=6 -> 5%

  var form, packages = [], destinations = [], lastQuote = null;

  /* --------------------------------------------------------------- options */
  function fillSelect(node, rows, valueOf, labelOf, placeholder) {
    if (!node) return;
    node.innerHTML = '<option value="">' + placeholder + '</option>' + rows.map(function (r) {
      return '<option value="' + GG.esc(valueOf(r)) + '">' + GG.esc(labelOf(r)) + '</option>';
    }).join('');
  }

  function initFields() {
    var pkg = GG.$('#bk-package', form), dest = GG.$('#bk-destination', form);
    fillSelect(pkg, packages, function (p) { return p.id; },
      function (p) { return p.title + ' - ' + p.duration_days + 'D' + (p.nights ? '/' + p.nights + 'N' : '') + ' from ' + GG.fmt.money(p.price_min); },
      'Select a tour package');
    fillSelect(dest, destinations, function (r) { return r.id; },
      function (r) { return r.name + ' (' + r.district + ')'; },
      'Optional - a single destination instead of a package');
    var extras = GG.$('#js-addons', form);
    if (extras) {
      extras.innerHTML = ADDONS.map(function (a) {
        return '<label class="check"><input type="checkbox" data-addon="' + a.id + '"> ' +
          '<span>' + a.label + ' <span class="muted small">+' + GG.fmt.money(a.price) +
          (a.per === 'person' ? ' / person' : '') + '</span></span></label>';
      }).join('');
    }
    var people = GG.$('#bk-adults', form);
    if (people && !people.value) people.value = '2';
  }

  /* ------------------------------------------------------------- validation */
  function setErr(name, msg) {
    var wrap = form.querySelector('[data-field="' + name + '"]');
    var box = wrap && wrap.querySelector('.error');
    if (box) box.textContent = msg || '';
    if (wrap) wrap.setAttribute('data-invalid', msg ? 'true' : 'false');
    var input = form.querySelector('[name="' + name + '"]');
    if (input) {
      if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
  }
  function T(key, en) { return GG.lang.t('err.' + key, en); }

  function iso(dstr) { return new Date(dstr + 'T00:00:00'); }
  function daysBetween(a, b) { return Math.round((iso(b) - iso(a)) / 86400000); }

  function validate(data) {
    var ok = true;
    ['name', 'email', 'phone', 'people_adults', 'date_start', 'date_end', 'package', 'consent']
      .forEach(function (k) { setErr(k, ''); });

    if (!data.name || data.name.trim().length < 3) { setErr('name', T('name', 'Enter the main traveller\u2019s full name (at least 3 characters).')); ok = false; }
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(data.email || '')) { setErr('email', T('email', 'Enter a valid email address, e.g. name@example.com')); ok = false; }
    var ph = (data.phone || '').replace(/[\s\-()]/g, '');
    if (!/^(\+?8801[3-9]\d{8}|01[3-9]\d{8})$/.test(ph)) {
      setErr('phone', T('phone', 'Use a Bangladeshi mobile number, e.g. +8801712345678 or 01712345678')); ok = false;
    }
    var adults = Number(data.people_adults) || 0, kids = Number(data.people_children) || 0;
    if (adults < 1) { setErr('people_adults', T('adults', 'At least 1 adult is required.')); ok = false; }
    if (adults + kids > 60) { setErr('people_adults', T('group', 'For groups above 60 travellers, contact the office directly.')); ok = false; }
    if (!data.date_start) { setErr('date_start', T('start', 'Choose a start date.')); ok = false; }
    if (!data.date_end) { setErr('date_end', T('end', 'Choose an end date.')); ok = false; }
    if (data.date_start && data.date_end) {
      if (daysBetween(data.date_start, data.date_end) < 0) { setErr('date_end', T('order', 'The end date must be the same as or later than the start date.')); ok = false; }
      if (daysBetween(data.date_start, data.date_end) > 45) { setErr('date_end', T('long', 'Online requests are capped at 45 days - email the office for longer expeditions.')); ok = false; }
    }
    var today = new Date(); today.setHours(0, 0, 0, 0);
    if (data.date_start && iso(data.date_start) < today) { setErr('date_start', T('past', 'The start date is in the past.')); ok = false; }
    if (!data.package && !data.destination) {
      setErr('package', T('choice', 'Choose a package, or name a single destination.')); ok = false;
    }
    if (GG.recaptchaToken && GG.recaptchaToken === 'missing') {
      setErr('captcha', T('captcha', 'Human check failed - reload the page and try again.')); ok = false;
    }
    if (data.captcha !== undefined) {
      if (String(data.captcha).trim() !== String(form._captchaAnswer)) {
        setErr('captcha', T('math', 'The arithmetic check is incorrect.')); ok = false;
      }
    }
    if (data._hp) { ok = false; }                     // honeypot: silently drop bots
    if (!data.consent) { setErr('consent', T('consent', 'Please allow GHORA GHURI to contact you about this request.')); ok = false; }
    return ok;
  }

  /* ----------------------------------------------------------------- quote */
  function quote(data) {
    var pkg = packages.filter(function (p) { return p.id === data.package; })[0];
    var dest = destinations.filter(function (r) { return r.id === data.destination; })[0];
    var adults = Number(data.people_adults) || 1, kids = Number(data.people_children) || 0;
    var nights = 0;
    if (data.date_start && data.date_end && daysBetween(data.date_start, data.date_end) >= 0) {
      nights = Math.max(1, daysBetween(data.date_start, data.date_end));
    }
    var unit, duration;
    if (pkg) { unit = pkg.price_min; duration = pkg.duration_days; }
    else if (dest) {
      unit = Math.round(((Number(dest.price_range_min) || 3000) + (Number(dest.price_range_max) || 5000)) / 2 / Math.max(1, dest.duration_days || 1));
      duration = dest.duration_days || 1;
    } else { unit = 3500; duration = 2; }
    if (nights) duration = Math.max(1, Math.min(nights, 45));
    var days = Math.max(1, duration);
    var subtotal = unit * days * (adults + kids * 0.7);
    if (data.tour_type === 'private') subtotal *= (1 + PRIVATE_MARKUP);
    var discount = 0, head = adults + kids;
    GROUP_TIERS.forEach(function (t) { if (!discount && head >= t[0]) discount = t[1]; });
    var addonTotal = 0;
    (data.addons || []).forEach(function (id) {
      var a = ADDONS.filter(function (x) { return x.id === id; })[0];
      if (a) addonTotal += a.per === 'person' ? a.price * head : a.price;
    });
    var guide = data.need_guide === 'yes' ? 0 : 0;   // guide already inside base rate
    var total = subtotal * (1 - discount) + addonTotal + guide;
    return {
      unit: unit, days: days, head: head,
      subtotal: Math.round(subtotal), discountPct: Math.round(discount * 100),
      discount: Math.round(subtotal * discount), addons: addonTotal,
      total: Math.round(total),
      label: pkg ? pkg.title : (dest ? dest.name + ' (custom trip)' : 'Custom trip'),
      perPerson: Math.round(total / head)
    };
  }

  function renderQuote() {
    var box = GG.$('#js-quote');
    if (!box) return;
    var q = lastQuote;
    if (!q) { box.innerHTML = '<p class="muted small mb-0">Fill in the dates and travellers to see a live estimate.</p>'; return; }
    box.innerHTML =
      '<h3 style="margin-top:0">' + GG.lang.t('book.estimate', 'Live estimate') + '</h3>' +
      '<p class="small muted mt-0">' + GG.esc(q.label) + '</p>' +
      '<table class="table"><tbody>' +
      '<tr><th scope="row">' + GG.lang.t('book.days', 'Basis') + '</th><td>' + q.days + ' day(s) &times; ' + GG.fmt.money(q.unit) + ' &times; ' + q.head + ' pax</td></tr>' +
      '<tr><th scope="row">' + GG.lang.t('book.sub', 'Subtotal') + '</th><td>' + GG.fmt.money(q.subtotal) + '</td></tr>' +
      (q.discount ? '<tr><th scope="row">Group discount</th><td>&minus; ' + GG.fmt.money(q.discount) + ' (' + q.discountPct + '%)</td></tr>' : '') +
      (q.addons ? '<tr><th scope="row">Add-ons</th><td>+ ' + GG.fmt.money(q.addons) + '</td></tr>' : '') +
      '<tr><th scope="row"><b>' + GG.lang.t('book.total', 'Estimated total') + '</b></th><td class="price-tag">' + GG.fmt.money(q.total) + '</td></tr>' +
      '<tr><th scope="row">' + GG.lang.t('book.pp', 'Per person') + '</th><td>' + GG.fmt.money(q.perPerson) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="hint">' + GG.lang.t('book.disclaimer', 'An estimate only. Final pricing is confirmed by the office after availability checks; 30% advance is normally required to hold beds and boats.') + '</p>';
  }

  /* ------------------------------------------------------------- capture */
  function readForm() {
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : v; });
    data.addons = GG.$$('[data-addon]:checked', form).map(function (n) { return n.getAttribute('data-addon'); });
    return data;
  }
  function recaptcha() {
    return new Promise(function (resolve) {
      if (!GG.cfg.recaptchaSiteKey || GG.cfg.recaptchaSiteKey.indexOf('YOUR_') > -1 || !w.grecaptcha) {
        resolve('captcha-disabled'); return;       // documented placeholder
      }
      try {
        w.grecaptcha.execute(GG.cfg.recaptchaSiteKey, { action: 'booking' })
          .then(function (t) { resolve(t); }, function () { resolve('missing'); });
      } catch (e) { resolve('missing'); }
    });
  }

  /* ------------------------------------------------------- confirmation UI */
  function confirmSheet(b) {
    var p = b.details;
    return '<div class="confirm-sheet" id="js-confirm-sheet">' +
      '<h2>GHORA GHURI &mdash; booking request</h2>' +
      '<p class="small muted mt-0">Daulatpur, Khulna, Bangladesh &middot; ' + GG.cfg.phone + ' &middot; ' + GG.cfg.email + '</p>' +
      '<div class="rule"></div>' +
      '<table><tbody>' +
      row('Booking reference', b.id) +
      row('Status', 'Received - awaiting availability confirmation') +
      row('Traveller', p.name) +
      row('Email / phone', p.email + ' / ' + p.phone) +
      row('Trip', (lastQuote ? lastQuote.label : p.package) + (p.destination ? ' (' + p.destination + ')' : '')) +
      row('Dates', GG.fmt.date(p.date_start) + ' to ' + GG.fmt.date(p.date_end) + ' (' + (b.quote ? b.quote.days : '-') + ' day basis)') +
      row('Travellers', p.people_adults + ' adult(s)' + (Number(p.people_children) ? ', ' + p.people_children + ' child(ren)' : '')) +
      row('Tour type', p.tour_type || 'shared') +
      row('Pick-up / drop-off', (p.pickup || '-') + ' / ' + (p.dropoff || p.pickup || '-')) +
      row('Add-ons', (p.addons && p.addons.length) ? p.addons.join(', ') : 'none') +
      row('Estimated total', b.quote ? GG.fmt.money(b.quote.total) + ' BDT' : 'on request') +
      row('Special requests', p.requests ? p.requests.slice(0, 400) : 'none') +
      row('Submitted', new Date(b.at).toLocaleString('en-GB')) +
      '</tbody></table>' +
      '<p class="footnote"><b>How to pay / next steps.</b> A GHORA GHURI representative confirms hotels, transport and permits, then sends a proforma invoice. ' +
      'Bank transfer, bKash personal, Nagad, Rocket or cash at the Khulna office are accepted. Card payment (Stripe) is not enabled on this preview build. ' +
      'This sheet is a request acknowledgement, not a ticket, until the deposit is received and a final itinerary is issued.</p>' +
      '</div>';
  }
  function row(k, v) { return '<tr><th scope="row">' + k + '</th><td>' + GG.esc(v == null ? '-' : v) + '</td></tr>'; }

  function openConfirm(b) {
    var dlg = GG.$('#js-confirm-dialog');
    if (!dlg) {
      dlg = GG.el('dialog'); dlg.id = 'js-confirm-dialog';
      d.body.appendChild(dlg);
    }
    dlg.innerHTML =
      '<form method="dialog" class="no-print-bar" style="margin:0"><div class="modal__head">' +
      '<h3 style="margin:0">' + GG.lang.t('book.received', 'Request received') + '</h3>' +
      '<button class="x-close" value="close" aria-label="Close">&#10005;</button></div></form>' +
      '<div class="modal__body">' + confirmSheet(b) + '</div>' +
      '<div class="modal__foot">' +
      '<button type="button" class="btn btn--ghost" data-copy-ref>' + GG.lang.t('book.copy', 'Copy reference') + '</button>' +
      '<button type="button" class="btn btn--ghost" data-print>' + GG.lang.t('book.print', 'Print / Save as PDF') + '</button>' +
      '<button type="button" class="btn btn--primary" value="close" data-close>' + GG.lang.t('book.done', 'Done') + '</button>' +
      '</div>';
    if (typeof dlg.showModal === 'function') dlg.showModal(); else { dlg.setAttribute('open', ''); }
    GG.on(GG.$('[data-print]', dlg), 'click', function () { makePdf(b); });
    GG.on(GG.$('[data-copy-ref]', dlg), 'click', function () {
      try { navigator.clipboard.writeText(b.id); } catch (e) { }
      GG.toast('Reference ' + b.id + ' copied', 'ok');
    });
    GG.on(GG.$('[data-close]', dlg), 'click', function () { dlg.close(); });
  }

  function makePdf(b) {
    var sheet = GG.$('#js-confirm-sheet');
    if (w.jspdf && w.jspdf.jsPDF && sheet) {
      try {
        var doc = new w.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
        doc.setFontSize(18); doc.text('GHORA GHURI - booking request', 42, 56);
        doc.setFontSize(10); doc.setTextColor(110);
        doc.text('Daulatpur, Khulna, Bangladesh | ' + GG.cfg.phone + ' | ' + GG.cfg.email, 42, 74);
        doc.setTextColor(20); doc.setFontSize(11);
        var y = 110, lines = [];
        sheet.querySelectorAll('tr').forEach(function (tr) {
          var k = tr.querySelector('th'), v = tr.querySelector('td');
          if (!k || !v) return;
          lines.push(k.textContent + ': ' + v.textContent);
        });
        lines.forEach(function (ln) {
          var wrapped = doc.splitTextToSize(ln, 480);
          doc.text(wrapped, 42, y); y += wrapped.length * 14 + 4;
          if (y > 760) { doc.addPage(); y = 56; }
        });
        doc.setFontSize(9); doc.setTextColor(120);
        doc.text('Generated ' + new Date().toLocaleString('en-GB') + '. Request acknowledgement - not a ticket until the deposit is received.', 42, 806);
        doc.save((b.id || 'ghora-ghuri-booking') + '.pdf');
        GG.track('booking_pdf', { id: b.id });
        return;
      } catch (e) { /* fall through to print */ }
    }
    var win = w.open('', '_blank', 'width=880,height=940');
    if (!win) { GG.toast('Allow pop-ups to print, or use your browser Print menu', 'error'); return; }
    win.document.write('<!doctype html><html lang="' + GG.lang.get() + '"><head><meta charset="utf-8"><title>GHORA GHURI ' + b.id +
      '</title><link rel="stylesheet" href="' + GG.url('assets/css/main.css') + '"><link rel="stylesheet" href="' +
      GG.url('assets/css/altair-theme-overrides.css') + '"></head><body style="padding:2rem"><div class="container" style="max-width:760px">' +
      (sheet ? sheet.outerHTML : '<p>No sheet</p>') + '</div><script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>');
    win.document.close();
  }

  /* -------------------------------------------------------------- submit */
  function submit(e) {
    e.preventDefault();
    var data = readForm();
    if (!validate(data)) {
      var first = form.querySelector('[data-invalid="true"]');
      if (first) { first.scrollIntoView({ block: 'center' }); var inp = first.querySelector('input,select,textarea'); inp && inp.focus(); }
      GG.toast(T('fix', 'Please correct the highlighted fields.'), 'error');
      GG.track('booking_validation_error', {});
      return;
    }
    lastQuote = quote(data);
    recaptcha().then(function (token) {
      var b = {
        id: GG.store.bookings.nextId(), at: new Date().toISOString(),
        details: data, quote: lastQuote, captcha: token, source: 'website',
        language: GG.lang.get()
      };
      var send = Promise.resolve();
      if (GG.store.useApi()) {
        send = w.fetch(GG.cfg.apiBase.replace(/\/$/, '') + '/api/bookings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
        }).catch(function () { GG.toast('API unreachable - saved locally instead', 'error'); });
      } else if (GG.cfg.formspreeEndpoint.indexOf('YOUR_FORM_ID') === -1) {
        send = w.fetch(GG.cfg.formspreeEndpoint, {
          method: 'POST', headers: { Accept: 'application/json' }, body: JSON.stringify(b.details)
        }).catch(function () { });
      }
      send.then(function () {
        return GG.store.bookings.add(b).then(function () {
          GG.store.write('gg.booking.last', b);
          openConfirm(b);
          form.reset();
          setFormDates();
          lastQuote = null; renderQuote();
          GG.track('booking_request', { trip: b.quote && b.quote.label, total: b.quote && b.quote.total, currency: 'BDT' });
          renderRecent();
        });
      });
    });
  }

  /* ------------------------------------------------------------ recent list */
  function renderRecent() {
    var host = GG.$('#js-my-bookings');
    if (!host) return;
    GG.store.bookings.list().then(function (rows) {
      if (!rows.length) { host.innerHTML = '<p class="muted small">No requests saved on this device yet.</p>'; return; }
      host.innerHTML = '<table class="table"><thead><tr><th>Ref</th><th>Trip</th><th>Dates</th><th>Estimate</th><th></th></tr></thead><tbody>' +
        rows.slice(0, 8).map(function (b) {
          return '<tr><td><code>' + GG.esc(b.id) + '</code></td><td>' + GG.esc(b.quote ? b.quote.label : '-') +
            '</td><td>' + GG.fmt.date(b.details.date_start) + '</td><td>' + (b.quote ? GG.fmt.money(b.quote.total) : '-') +
            '</td><td><button class="btn btn--ghost btn--sm" data-forget="' + GG.esc(b.id) + '">Forget</button></td></tr>';
        }).join('') + '</tbody></table>';
      host.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-forget]');
        if (!btn) return;
        GG.store.bookings.remove(btn.getAttribute('data-forget'));
        renderRecent();
      });
    });
  }

  /* ------------------------------------------------------------------ init */
  function setFormDates() {
    var s = GG.$('#bk-date-start', form), en = GG.$('#bk-date-end', form);
    var today = new Date();
    var min = today.toISOString().slice(0, 10);
    if (s) { s.min = min; if (!s.value) s.value = min; }
    if (en) {
      en.min = min;
      if (!en.value) { var t = new Date(Date.now() + 2 * 86400000); en.value = t.toISOString().slice(0, 10); }
    }
    var dep = GG.param('depart');
    if (dep && s) s.value = dep;
  }

  function initCaptcha() {
    var a = 2 + Math.floor(Math.random() * 7), b = 3 + Math.floor(Math.random() * 8);
    form._captchaAnswer = a + b;
    var node = GG.$('#js-captcha-q', form);
    if (node) node.textContent = a + ' + ' + b + ' =';
  }

  function boot() {
    form = GG.$('#js-booking-form');
    Promise.all([GG.store.get('packages'), GG.store.get('destinations')]).then(function (r) {
      packages = r[0] || []; destinations = r[1] || [];
      if (!form) { renderRecent(); return; }
      initFields();
      var prePkg = GG.param('package'), preDest = GG.param('destination');
      if (prePkg) { var s1 = GG.$('#bk-package', form); if (s1) s1.value = prePkg; }
      if (preDest) {
        var s2 = GG.$('#bk-destination', form);
        if (s2) { s2.value = preDest; var rec = destinations.filter(function (x) { return x.id === preDest; })[0];
          if (rec) { var t = GG.$('#bk-trip-title', form); if (t) t.textContent = 'Custom trip: ' + rec.name; } }
      }
      setFormDates(); initCaptcha();
      if (GG.$('#bk-date-start', form).value && GG.$('#bk-date-end', form).value) lastQuote = quote(readForm());
      renderQuote(); renderRecent();
      GG.on(form, 'submit', submit);
      form.addEventListener('input', GG.util.debounce(function () {
        if (GG.$('#bk-date-start', form).value && GG.$('#bk-date-end', form).value) { lastQuote = quote(readForm()); }
        else lastQuote = null;
        renderQuote();
      }, 200));
      form.addEventListener('change', function () { lastQuote = quote(readForm()); renderQuote(); });
      GG.on(GG.$('[data-recalc]', form), 'click', function () { lastQuote = quote(readForm()); renderQuote(); });
      GG.util.dispatch('gg:lang', {});
    });
  }
  GG.toast = GG.toast || function (m) { d.getElementById('js-form-error') && (d.getElementById('js-form-error').textContent = m); };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
