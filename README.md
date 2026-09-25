# GHORA GHURI - website build

Static site for **GHORA GHURI Travel & Tour** (Daulatpur, Khulna, Bangladesh): a Bangladesh tour operator
site with a destination database, tour packages, search, maps, a booking-request flow, an admin content
manager, English/Bangla interface strings, and SEO/JSON-LD markup.

Built as a **static-first** site: all content lives in `data/*.json`, all behaviour is plain JavaScript with
no build step, so the whole folder can be dropped on any host (Netlify, Cloudflare Pages, cPanel, S3, an
Apache box in Khulna). A Node API stub is included for teams that want a server.

## What is in here

```
index.html                  home: hero slider, quick search, featured packages/carousels
pages/destinations.html     142-record searchable/filterable index + division directory
pages/destination-detail.html?id=...   one template, all destinations (map, gallery, itinerary, JSON-LD)
pages/packages.html         14 tour packages, filter by trip type
pages/package-detail.html?id=...       day-by-day itinerary, inclusions, departure dates
pages/booking.html          booking form: validation, live estimate, printable/PDF confirmation
pages/contact.html  pages/about.html  pages/faq.html  pages/blog.html (+ ?id= article view)
pages/privacy.html  pages/terms.html   404.html
pages/admin.html            content manager (edit/export/import destinations + packages, bookings inbox)
assets/css/main.css         design system (no framework required)
assets/css/fonts.css        self-hosted Bangla webfont (@font-face, unicode-range)
assets/fonts/               Hind Siliguri woff2 - bengali 400/700, latin 400 (OFL-1.1)
assets/css/altair-theme-overrides.css   second layer: Altair-style refinements, print + Bangla type
assets/js/                  site-data, store, main, search, content, bookings, contact, admin, lite-data
assets/vendor/              bootstrap 5.3.3 (optional), leaflet 1.9.4, jspdf 2.5.2
data/destinations.json      142 destinations  -  data/packages.json 14 packages
data/blog.json              6 field notes   -  data/translations/{en,bn}.json
assets/images/              78 audited Commons photographs (main + thumb) + 5 hero banners
server-stubs/               Node and PHP API examples, .env template, payment notes
ATTRIBUTION.md              per-image Commons credits and vendored-library licences
index.preview.html          single-file preview (everything inlined) - see "Preview file" below
404.html                      styled not-found page with recovery links
assets/images/hero-banners/   five 1600 px home-page slides
```

## Run it

Any static server works:

```bash
cd this-folder
python3 -m http.server 8080      # then open http://localhost:8080
# or: npx serve .   /   php -S localhost:8080
```

Opening `index.html` directly from the file system also works, but the browser cannot
`fetch()` the JSON files, so the site falls back to `assets/js/lite-data.js` (first 12
destinations and 4 packages) and says so in the notice bar. Use `index.preview.html` for a
complete file:// experience, or serve the folder.

## Editing content

Three ways, in increasing order of permanence:

1. **Admin panel** - `pages/admin.html`. Demo sign-in `ghora-admin` / `ChangeMe!2026`.
   Edits are saved in the browser's localStorage so you can try them immediately; use
   *Export destinations.json* / *Export bundle JSON* to get the files, then put them in `data/`.
   With *Server mode* ticked the same panel PUTs to the API stub instead.
   **This panel is a content tool, not a security boundary** - a static site cannot keep a
   secret. Put authentication in front of it (host basic auth, Cloudflare Access) or leave it
   off public deployments by deleting the page.
2. **JSON directly** - `data/destinations.json` and `data/packages.json` are plain arrays; one
   object per destination/package. The full field contract is at the bottom of this README.
3. **Server mode** - run `server-stubs/api-example-node.js` and the site reads/writes
   `data/` through it (see the stub's own header comment).

### Destination field contract

| Field | Type | Notes |
|---|---|---|
| `id`, `slug` | string | kebab-case, used in URLs (`?id=`) and as the image filename |
| `name`, `name_bn` | string | Bangla shown when the site language is `bn` |
| `division`, `district` | one of the 8 divisions / district name | drives filters and the index |
| `tags` | string[] | `beach heritage hill wildlife eco river lake island haor village city pilgrimage adventure photography family offbeat ...` |
| `latitude`, `longitude` | number | must be inside Bangladesh (20.5-26.7 N, 88.0-92.7 E) |
| `best_time` | string | e.g. `October to March` |
| `duration_days` | int | used for "suggested stay" and pricing |
| `price_range_min`, `price_range_max` | int (BDT, per person) | shown as a range; never a booking price |
| `short_description` | string 30-50 words | cards, meta description, JSON-LD |
| `long_description` | string 200-500 words, `\n\n` between paragraphs | the article body |
| `highlights` | string[] 4-8 items | "Do not miss" list |
| `arrive`, `stay`, `plan`, `extras` | strings | practical details |
| `image`, `image_thumb` | path | relative, e.g. `assets/images/destinations/kuakata.jpg` |
| `image_remote` | URL | used only when no local file exists |
| `gallery` | `[{local,remote,alt}]` | feeds the lightbox |
| `sample_itinerary` | `[{title,detail}]` | day-by-day block |
| `video_embed` | URL or `""` | if set, an embed is offered on the detail page |
| `featured` | bool | appears in home carousels and "most requested" |

Packages use: `id title title_bn summary duration_days nights price_min price_max stops[]
destination_ids[] tags[] division badge image rating reviews group_size languages meals
featured itinerary[{title,detail}] included[] excluded[] departure_dates[{date,seats,price}]`.

## Images

`assets/images/destinations/` holds one `<id>.jpg` (1000 px, quality 58-60) and one
`<id>.thumb.jpg` (400 px) per photo, plus five `hero-banners/slide-N.jpg` (1600 px).
Every file is a resized Wikimedia Commons image with the licence recorded in `ATTRIBUTION.md`
(78 of the 142 records carry a photograph; the rest deliberately show a generated poster, and
`ATTRIBUTION.md` lists each one with the reason no image was used).
Selection rules used:

* a curated Commons category for the site was trusted outright;
* a keyword-searched file was accepted only when its title contains a distinctive token of the
  destination's own name;
* an audit pass then dropped images whose title looked like an event, document or specimen shot,
  leaving the generated poster instead - a wrong photo is worse than no photo on a travel site.

To add your own: drop `<id>.jpg` + `<id>.thumb.jpg` in that folder and set the two paths on the
record. Anything not found falls back to `image_remote`, then to a generated gradient poster.

## Languages

* The interface is English by default; `EN / বাংলা` in the top bar switches to Bangla.
* Strings come from `data/translations/en.json` and `bn.json` (~150 keys each); elements opt in
  with `data-i18n="key"`, `data-i18n-attr="title:key"`, `data-i18n-placeholder="q:placeholder"`.
* Per-record Bangla lives in the data itself: `name_bn`, `short_bn`, and package `title_bn`.
* `lang="bn"` on `<html>` also loads the Bengali font stack and bumps line-height; add
  `dir="rtl"` to a page if you ever translate to Arabic-script languages.
* Adding a third language: create `data/translations/<code>.json`, and add a `<button data-lang="xx">`
  next to the existing two.

## Booking flow

`pages/booking.html` validates (BD mobile format, email, adult count, date order and past dates,
45-day cap, package-or-destination rule, arithmetic check, consent, honeypot), prices the trip
from the package/day rate with group-tier discounts and add-ons, saves to `localStorage`
(`gg.bookings.v1`), then shows a printable confirmation sheet with a reference like
`GG-20260925-001`. *Print / Save as PDF* uses jsPDF when available and the browser print dialog
otherwise (`@media print` styles are in `altair-theme-overrides.css`).

Nothing is charged. **No payment gateway is enabled in this build.** Payment rails (bKash /
Nagad / Rocket / bank transfer / cash) are described in the UI and in `server-stubs/payment-notes.md`,
which shows where an SSLCommerz or Stripe checkout would be inserted.

## Integrations - placeholders you must fill

| Where | Placeholder | What to do |
|---|---|---|
| `assets/js/site-data.js` | `googleMapsKey: 'YOUR_GOOGLE_MAPS_JS_KEY'` | only needed if you set `mapEngine:'google'`; Leaflet works without any key |
| `site-data.js` | `recaptchaSiteKey: 'YOUR_RECAPTCHA_V3_SITE_KEY'` | v3 site key; add the secret to the API stub, which must score-check |
| `site-data.js` | `formspreeEndpoint: 'https://formspree.io/f/YOUR_FORM_ID'` | free tier form endpoint if you keep hosting static |
| `site-data.js` | `gaMeasurementId: 'G-XXXXXXXXXX'`, `fbPixelId: '000...'` | loaded only after cookie consent |
| `site-data.js` | `apiBase: ''` | set to your API origin to switch the forms to `POST /api/bookings` |
| `server-stubs/.env` | `ADMIN_USER`, `ADMIN_HASH`, `SESSION_SECRET`, `ALLOW_ORIGIN` | create from `.env.example` |
| `build.py` | `SITE_BASE` | rebuild with your real domain so canonical/OG/sitemap URLs are right |

## Privacy, cookies, consent

* One required localStorage key for the language + consent choice; analytics and pixel scripts are
  injected only after "Accept all" (`pages/privacy.html` lists every key the site writes).
* Forms carry an explicit consent checkbox, a honeypot and an arithmetic check; reCAPTCHA v3 is
  wired but inert until a key exists.
* "Erase local data" on the privacy page removes everything this build stores.
* GDPR-style rights, retention periods and the data list are documented in `pages/privacy.html`;
  booking terms, cancellation charges, permits and liability in `pages/terms.html`.

## Accessibility & performance

* Keyboard-operable everything: skip link, focus-visible rings, `aria-current`, `aria-expanded`
  menus, `role="tablist"` hero dots, `role="alert"` errors, lightbox focus trap with Esc/arrows.
* Landmarks (`header`, `nav`, `main`, `footer`, `aside`) plus labelled sections; images have alt
  text and `loading="lazy"`.
* Colour contrast: body text on the brand green and dark footer clears 4.5:1; the accent red is used
  for large text and flags only.
* `prefers-reduced-motion` disables the hero auto-advance and reveals. No layout-shifting webfont
  storm: one Bangla webfont, preloaded, system stack otherwise.
* Home page weight: ~118 KB of CSS+JS + one 1600 px hero; list pages render from a 0.9 MB JSON
  file, which is cached by the browser for the session.

## Preview file

`index.preview.html` is the whole site (CSS, JS, data and images as data URIs) in one file, for
opening anywhere with no server and no network. It is a review artefact, not the deployable site -
links to `pages/...` inside it work because they are relative, but it does not benefit from caching
and it is large. Regenerate it with the builder (`work/build.py`) after editing `data/`.

## Deploying

* **Netlify / Cloudflare Pages**: publish this folder; no build command. Add a `_redirects` file with
  `/* /index.html 200` only if you later move to pretty URLs.
* **Apache/cPanel**: upload as-is; add `Header set Cache-Control "max-age=31536000, immutable"` for
  `assets/images` in `.htaccess` if you want aggressive caching.
* **With the API**: run the Node stub (or reimplement the four endpoints) behind HTTPS, point
  `GG.cfg.apiBase` at it, keep `data/*.json` as the read cache, and protect `pages/admin.html`.

## Generated from source

This tree was produced by the project builder (`destinations_seed.json` -> `data/destinations.json`).
Re-running the builder regenerates the site and overwrites `data/`; the builder keeps its source of
truth in `work/` (seed JSON, page fragments, CSS/JS), so edit there for a rebuild, or edit `data/`
directly if you are now maintaining the site by hand.

Contact: +8801330132141 - info.borshon@gmail.com.
