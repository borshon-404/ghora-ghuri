# server-stubs/

Optional server pieces for the GHORA GHURI static site. The site does **not** need them:
`data/*.json` + localStorage is enough to run the whole thing, including the admin panel.
Add a server when you want submissions collected centrally, or admin edits written back to files.

| File | Use it when |
|---|---|
| `api-example-node.js` | you have a VPS/PaaS and want a zero-dependency Node 18 service |
| `api-example-php.php` | shared hosting (most Bangladeshi cPanel boxes) - single file, no composer |
| `.env.example` | credentials the API needs |
| `payment-notes.md` | what a gateway integration would look like; nothing is enabled now |

## Quick start (Node)

```bash
cd server-stubs
cp .env.example .env            # fill ADMIN_HASH (sha256 of "user:pass") and SESSION_SECRET
node api-example-node.js        # listens on :8787, serves ../data
curl -s localhost:8787/api/health
```

Then in `../assets/js/site-data.js` set `apiBase: 'http://localhost:8787'` (or turn on
*Server mode* in `pages/admin.html`, which stores the same preference).

## Quick start (PHP)

Upload `api-example-php.php` as `api/index.php` on the host, create a `store/` directory that the
web user can write to (outside the document root if your host allows), set the environment
variables from `.env.example`, and point `apiBase` at `https://yourdomain.com/api`.

## What is deliberately left to you

* Real database (the examples write JSON files with an exclusive lock)
* Email delivery (`sendMail()` / `mail()` stubs print to stdout)
* TLS, firewall, backups, log shipping
* Password reset and 2FA - if the admin panel goes public, gate it with host basic auth or
  Cloudflare Access in front, and change the demo passcode
* File uploads for destination photos (add `POST /api/media` and store outside the web root)

The validation rules in both files match the client (BD mobile format, email, adult count, date
order, 45-day cap, consent, honeypot, reCAPTCHA score) - so the same form works when someone turns
JavaScript off or posts directly at the API.
