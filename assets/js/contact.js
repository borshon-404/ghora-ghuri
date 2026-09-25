// assets/js/contact.js - contact form validation + local queue + mailto bridge
(function (w, d) {
  'use strict';
  var GG = w.GG, form;
  function setErr(name, msg) {
    var wrap = form.querySelector('[data-field="' + name + '"]');
    if (!wrap) return;
    var box = wrap.querySelector('.error');
    if (box) box.textContent = msg || '';
    wrap.setAttribute('data-invalid', msg ? 'true' : 'false');
  }
  function read() {
    var o = {};
    new FormData(form).forEach(function (v, k) { o[k] = typeof v === 'string' ? v.trim() : v; });
    return o;
  }
  function valid(o) {
    var ok = true;
    ['name', 'email', 'message', 'consent'].forEach(function (k) { setErr(k, ''); });
    if (!o.name || o.name.length < 3) { setErr('name', 'Please tell us your name (3 characters or more).'); ok = false; }
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(o.email || '')) { setErr('email', 'Enter a valid email address so we can reply.'); ok = false; }
    if (!o.message || o.message.length < 20) { setErr('message', 'Add a little more detail - at least 20 characters.'); ok = false; }
    if (!o.consent) { setErr('consent', 'Tick the box so we may reply to you.'); ok = false; }
    return ok;
  }
  function body(o) {
    return 'GHORA GHURI website message\n\nFrom: ' + o.name + ' <' + o.email + '>\nPhone: ' + (o.phone || '-') +
      '\nTopic: ' + (o.topic || '-') + '\nWhen: ' + new Date().toISOString() +
      '\n\n' + o.message;
  }
  function boot() {
    form = GG.$('#js-contact-form');
    if (!form) return;
    GG.on(form, 'submit', function (e) {
      e.preventDefault();
      var o = read();
      if (!valid(o)) { GG.toast('Please correct the highlighted fields.', 'error'); return; }
      if (o._hp) { o._hp = null; }   // honeypot: drop silently
      var done = function () {
        var box = GG.$('#js-contact-done');
        if (box) box.hidden = false;
        var list = GG.store.read('gg.messages.v1', []);
        list.push({ at: new Date().toISOString(), data: o });
        GG.store.write('gg.messages.v1', list);
        form.reset();
        GG.toast('Message queued on this device.', 'ok');
        GG.track('contact_send', { topic: o.topic });
      };
      if (GG.store.useApi() && GG.cfg.apiBase) {
        w.fetch(GG.cfg.apiBase.replace(/\/$/, '') + '/api/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o)
        }).then(done, function () { GG.toast('API unreachable - queued locally instead.', 'error'); done(); });
      } else if (GG.cfg.formspreeEndpoint.indexOf('YOUR_FORM_ID') === -1) {
        w.fetch(GG.cfg.formspreeEndpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: JSON.stringify(o) })
          .then(done, function () { GG.toast('Endpoint unreachable - queued locally instead.', 'error'); done(); });
      } else { done(); }
    });
    GG.on(GG.$('[data-mailto]', form), 'click', function () {
      var o = read();
      if (!valid(o)) { GG.toast('Fill the form first, then open your email app.', 'error'); return; }
      w.location.href = 'mailto:' + GG.cfg.email + '?subject=' + encodeURIComponent('[web] ' + (o.topic || 'Enquiry') + ' - ' + o.name) +
        '&body=' + encodeURIComponent(body(o));
    });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
