# Payment - what is wired and what is not

**This build takes no money.** The booking form is an enquiry: it validates, prices an estimate,
stores the request and prints a confirmation sheet. That is deliberate - a static site cannot
handle a card flow safely, and no gateway credentials were supplied for this project.

## What the site offers today

| Method | Status | Where it is described |
|---|---|---|
| Bank transfer (Dutch-Bangla Bank, Khulna) | documented, invoice-driven | `pages/booking.html`, `pages/faq.html` |
| bKash / Nagad / Rocket (personal numbers) | documented, invoice-driven | same, plus the footer payment row |
| Cash at the office or to the guide | documented | same |
| Card (Stripe / SSLCommerz / Binance Pay) | **not enabled** - placeholder only | this file |

## Wiring a gateway (the short version)

1. **Pick one that settles in BDT for local guests** - SSLCommerz or aamarpay are the usual choices
   for Bangladeshi operators; Stripe is the option for foreign cards and needs a supporting entity
   or an aggregator.
2. **Server side only.** Create the session with your *secret* key from the API stub
   (`POST /api/payments/create`), never from the browser. Add `POST /api/payments/webhook`
   and treat **only** the webhook as proof of payment:
   * verify the HMAC/signature header with the gateway secret;
   * check `amount` and `currency` against the invoice you stored, not against the client's number;
   * store the gateway transaction id against the booking row and set status `paid`;
   * return HTTP 200 quickly; do the rest asynchronously.
3. **Deposit logic.** Our process is 30% advance, balance on arrival, so a booking should move from
   `enquiry` -> `quote_sent` -> `deposit_pending` -> `confirmed`. Keep `payment_status` separate from
   `booking_status`; refunds update the first and annotate the second.
4. **Refunds and chargebacks**: keep the cancellation ladder from `pages/terms.html` next to the
   refund button in the admin - the percentages there are what staff should be applying.
5. **Never persist PAN data.** Use the gateway's hosted field/redirect so card numbers do not touch
   this server; storing them would put the site in PCI-DSS scope for no benefit.

## Suggested endpoint contract to add to `api-example-node.js`

```
POST /api/payments/create    { bookingId }                 -> { redirectUrl }
POST /api/payments/webhook   (gateway, signed)              -> 200, updates booking
GET  /api/bookings/:id/quote                               -> proforma invoice PDF
```

## Mobile banking fields (manual flow)

If you keep the manual flow, put these on the invoice rather than in the UI: account title,
bank and branch, account number, and the personal bKash/Nagad number with a note that
"payment reference = booking id". The admin inbox then has one field, `payment_ref`, to match.
