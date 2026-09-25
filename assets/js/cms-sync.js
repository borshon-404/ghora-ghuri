/* ==========================================================================
   GHORA GHURI - cms-sync.js
   Dynamic CMS Hydration Engine. Automatically injects live backend settings,
   header, footer, hero slides, portfolio, and page content across all pages.
   ========================================================================== */
(function (w, d) {
  'use strict';
  var GG = w.GG = w.GG || {};

  function safeText(sel, text, ctx) {
    var el = (ctx || d).querySelector(sel);
    if (el && text != null) el.textContent = text;
  }
  function safeHTML(sel, html, ctx) {
    var el = (ctx || d).querySelector(sel);
    if (el && html != null) el.innerHTML = html;
  }

  function applySettings(s) {
    if (!s) return;
    // Brand name & tagline
    if (s.site_name) {
      d.querySelectorAll('.brand__name').forEach(function (el) { el.textContent = s.site_name; });
    }
    if (s.site_tagline) {
      d.querySelectorAll('.brand__tag').forEach(function (el) { el.textContent = s.site_tagline; });
    }

    // Phone numbers and tel links
    if (s.phone) {
      d.querySelectorAll('a[href^="tel:"]').forEach(function (el) {
        el.href = 'tel:' + s.phone.replace(/\s+/g, '');
        el.textContent = s.phone;
      });
      d.querySelectorAll('[data-cms-phone]').forEach(function (el) { el.textContent = s.phone; });
    }

    // Email addresses and mailto links
    if (s.email) {
      d.querySelectorAll('a[href^="mailto:"]').forEach(function (el) {
        if (!el.getAttribute('href').includes('?subject=')) {
          el.href = 'mailto:' + s.email;
        } else {
          var sub = el.getAttribute('href').split('?subject=')[1];
          el.href = 'mailto:' + s.email + '?subject=' + sub;
        }
        if (el.textContent.includes('@')) el.textContent = s.email;
      });
      d.querySelectorAll('[data-cms-email]').forEach(function (el) { el.textContent = s.email; });
    }

    // Office address
    if (s.address) {
      d.querySelectorAll('.topbar .hide-sm, .contact-line span, [data-cms-address]').forEach(function (el) {
        if (el.textContent.includes('Khulna') || el.hasAttribute('data-cms-address')) {
          el.textContent = s.address;
        }
      });
    }

    // Social Links
    if (s.social_facebook) {
      var fb = d.querySelector('a[aria-label="Facebook"]');
      if (fb) fb.href = s.social_facebook;
    }
    if (s.social_instagram) {
      var ig = d.querySelector('a[aria-label="Instagram"]');
      if (ig) ig.href = s.social_instagram;
    }
    if (s.social_youtube) {
      var yt = d.querySelector('a[aria-label="YouTube"]');
      if (yt) yt.href = s.social_youtube;
    }
    if (s.social_whatsapp) {
      var wa = d.querySelector('a[aria-label="WhatsApp"]');
      if (wa) wa.href = s.social_whatsapp;
    }

    // Footer About text & Copyright
    if (s.footer_about) {
      var fDesc = d.querySelector('.footer-grid > div:first-child p');
      if (fDesc) fDesc.textContent = s.footer_about;
    }
    if (s.copyright_text) {
      var cRight = d.querySelector('.footer-base span:first-child');
      if (cRight) cRight.textContent = s.copyright_text;
    }

    // Announcement bar (if active)
    if (s.announcement_active && s.announcement_bar) {
      var topbar = d.querySelector('.topbar');
      if (topbar && !d.getElementById('cms-announcement')) {
        var bar = d.createElement('div');
        bar.id = 'cms-announcement';
        bar.style.cssText = 'background:var(--gold,#e0a82e);color:#0b241c;text-align:center;padding:5px 12px;font-size:0.85rem;font-weight:600;';
        bar.innerHTML = s.announcement_bar;
        topbar.parentNode.insertBefore(bar, topbar);
      }
    }
  }

  function applyPages(pages) {
    if (!pages) return;
    var path = w.location.pathname;
    var isHome = path === '/' || path.endsWith('/index.html') || path.endsWith('/');

    if (isHome && pages.home) {
      var h = pages.home;
      if (h.hero_slides && h.hero_slides.length) {
        var slidesHost = d.querySelector('.hero__slides');
        if (slidesHost) {
          slidesHost.innerHTML = h.hero_slides.map(function (s) {
            var bgStyle = 'background-image:url(' + (s.bg_image || 'assets/images/destinations/sundarbans.jpg') + ');background-size:cover;background-position:center;';
            return '<div class="hero__slide" style="' + bgStyle + '">' +
              '<div class="container hero__inner">' +
                (s.eyebrow ? '<p class="eyebrow">' + GG.esc(s.eyebrow) + '</p>' : '') +
                '<h1>' + GG.esc(s.title) + '</h1>' +
                '<p>' + GG.esc(s.subtitle) + '</p>' +
                '<div class="hero__cta">' +
                  '<a class="btn btn--accent" href="' + (s.cta_primary_link || '#') + '">' + GG.esc(s.cta_primary_text || 'Explore') + '</a>' +
                  '<a class="btn btn--light" href="' + (s.cta_secondary_link || '#') + '">' + GG.esc(s.cta_secondary_text || 'Learn more') + '</a>' +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('');
          if (w.GG && w.GG.initHero) w.GG.initHero();
        }
      }
      if (h.highlights_title) safeText('.section-head h2', h.highlights_title);
      if (h.highlights_subtitle) safeText('.section-head p', h.highlights_subtitle);

      if (h.sundarban_banner) {
        var sb = d.querySelector('.band');
        if (sb) {
          safeText('h2', h.sundarban_banner.title, sb);
          safeText('p', h.sundarban_banner.subtitle, sb);
          var sbLink = sb.querySelector('a.btn');
          if (sbLink) {
            sbLink.textContent = h.sundarban_banner.link_text || 'Explore';
            sbLink.href = h.sundarban_banner.link_url || 'pages/packages.html';
          }
        }
      }

      if (h.testimonials && h.testimonials.length) {
        var tHost = d.querySelector('.grid--3[data-testimonials], .quotes .grid--3, section.quotes .grid');
        if (tHost) {
          tHost.innerHTML = h.testimonials.map(function (t) {
            return '<blockquote class="card quote" data-reveal>' +
              '<p>&ldquo;' + GG.esc(t.quote) + '&rdquo;</p>' +
              '<footer><span class="avatar">' + GG.esc(t.avatar || 'TT') + '</span>' +
              '<cite>' + GG.esc(t.author) + '</cite>' +
              '<span class="muted small">' + GG.esc(t.role) + '</span></footer>' +
            '</blockquote>';
          }).join('');
        }
      }
    }

    // About page dynamic fields
    if (path.includes('about.html') && pages.about) {
      var ab = pages.about;
      if (ab.mission_statement) {
        var missionEl = d.querySelector('.lead, [data-cms-mission]');
        if (missionEl) missionEl.textContent = ab.mission_statement;
      }
      if (ab.founder_name) safeText('[data-cms-founder-name]', ab.founder_name);
      if (ab.founder_bio) safeText('[data-cms-founder-bio]', ab.founder_bio);
      if (ab.story_paragraphs && ab.story_paragraphs.length) {
        var storyHost = d.querySelector('[data-cms-story]');
        if (storyHost) {
          storyHost.innerHTML = ab.story_paragraphs.map(function (p) { return '<p>' + GG.esc(p) + '</p>'; }).join('');
        }
      }
    }

    // Contact page dynamic fields
    if (path.includes('contact.html') && pages.contact) {
      var co = pages.contact;
      if (co.heading) safeText('h1, [data-cms-contact-heading]', co.heading);
      if (co.office_hours) safeText('[data-cms-office-hours]', co.office_hours);
    }
  }

  function applyPortfolio(items) {
    if (!items || !items.length) return;
    var host = d.querySelector('[data-portfolio-list]');
    if (!host) return;
    host.innerHTML = items.map(function (item) {
      return '<div class="card card--pad" style="display:flex;flex-direction:column;gap:.75rem">' +
        (item.image ? '<img src="' + item.image + '" alt="' + GG.esc(item.title) + '" style="border-radius:6px;width:100%;height:180px;object-fit:cover" loading="lazy">' : '') +
        '<span class="badge" style="align-self:flex-start">' + GG.esc(item.category || 'Tour') + '</span>' +
        '<h3 style="margin:0;font-size:1.2rem">' + GG.esc(item.title) + '</h3>' +
        '<p class="small muted" style="margin:0">Client: <b>' + GG.esc(item.client || 'Private') + '</b> &bull; ' + GG.esc(item.date || '') + '</p>' +
        '<p class="small" style="margin:0">' + GG.esc(item.description || '') + '</p>' +
      '</div>';
    }).join('');
  }

  function hydrateCMS() {
    if (!GG.store || !GG.store.get) return;
    Promise.all([
      GG.store.get('settings').catch(function () { return null; }),
      GG.store.get('pages').catch(function () { return null; }),
      GG.store.get('portfolio').catch(function () { return null; })
    ]).then(function (results) {
      applySettings(results[0]);
      applyPages(results[1]);
      applyPortfolio(results[2]);
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', hydrateCMS);
  else hydrateCMS();

  GG.hydrateCMS = hydrateCMS;
})(window, document);
