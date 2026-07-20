# 07. Payments & Integrations

> How money moves through MEMI: three card/wallet providers (Stripe, SumUp, PayPal) plus Klarna and Apple Pay / Google Pay (both on Stripe), all **config-gated**, all **re-verified server-side** against a total the browser cannot influence. Payments are where a one-cent drift breaks *every* order — read the total-parity rule first.

This is the highest-risk surface in the codebase. Every claim here is checked against `MEMI-Backend/src/routes/payments.js`, `src/payment-providers.js`, `src/routes/orders.js`, `src/routes/resi.js`, `src/invoicing.js`, `src/order-compensation.js`, and `Memi Abbigliamento/checkout.html`. When docs and code disagree, the code wins.

---

## The config-gating principle

Every provider is **enabled only if its server credentials exist**. With no credentials, the entry point reports "not configured" and the route returns **503** — the storefront reads that and **hides the option** rather than dead-ending the buyer. Nothing fake is ever offered.

`GET /api/payments/config` is the single source of truth the checkout reads on load:

```jsonc
{
  "publishableKey": "pk_live_… | null",         // Stripe publishable (safe to expose)
  "providers": { "stripe": true, "paypal": false, "sumup": true },
  "paypal": { "clientId": "…", "env": "sandbox" } | null
}
```

- `stripe` → `Boolean(process.env.STRIPE_SECRET_KEY)`
- `paypal` → `paypalConfigured()` = `PAYPAL_CLIENT_ID && PAYPAL_SECRET`
- `sumup`  → `sumupConfigured()`  = `SUMUP_API_KEY && SUMUP_MERCHANT_CODE`

Publishable keys and the PayPal client-id are designed to be public; **secrets never leave the server**.

## Provider comparison

| Provider | Method / API | Where the buyer pays | Create endpoint | Server-side verify (in `orders.js`) | Enabled by |
|---|---|---|---|---|---|
| **Stripe** (card) | PaymentIntent, `automatic_payment_methods` | Stripe Elements, in-page | `POST /api/payments/create-intent` | `paymentIntents.retrieve` → `status==='succeeded'` + `amount`/`currency` match | `STRIPE_SECRET_KEY` |
| **Klarna** | Stripe PaymentIntent restricted to `payment_method_types:['klarna']` | Stripe Payment Element, redirect to Klarna | `POST /api/payments/create-intent` (klarna-only) | dedicated `payment_method:'klarna'` branch — `paymentIntents.retrieve` + amount/currency match; `succeeded`→`pagato`, `processing`→`in_attesa` (webhook settles) | `STRIPE_SECRET_KEY` |
| **Apple Pay / Google Pay** | Stripe **Payment Request Button** (both wallets, one integration) | Native wallet sheet, in-page (no redirect) | `POST /api/payments/create-intent` (card-capable) | submits as `carta` → Stripe **card branch**: client `confirmCardPayment`, server `paymentIntents.retrieve` → `succeeded` + amount/currency match | `STRIPE_SECRET_KEY` + Apple Pay domain |
| **SumUp** (card) | Online Payments Checkouts v0.1 | **Embedded SumUp widget, in-page** on the Pagamento step | `POST /api/payments/sumup/create-checkout` | `getSumupCheckout` → `status==='PAID'` + `amount`/`currency` match | `SUMUP_API_KEY` + `SUMUP_MERCHANT_CODE` |
| **PayPal** | Orders v2 (create → approve → capture-after-commit) | PayPal JS SDK popup | `POST /api/payments/paypal/create-order` → `/paypal/capture` | `inspectPaypalOrder` → `APPROVED`/`COMPLETED` + amount match, then capture | `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET` |

All amounts are **EUR**, integer cents. Every verification path rejects with **402** on any mismatch and **503** if a selected provider is unconfigured. `orders.payment_intent_id` is **UNIQUE**, giving cross-provider replay protection (a checkout id / PI id / PayPal order id can back exactly one order).

---

> ## ⚠️ THE TOTAL-PARITY RULE (memorize this)
>
> **`checkout.html` computes the amount charged; `POST /api/orders` recomputes the total server-side and rejects any mismatch with `402 "Importo del pagamento non corrisponde"`.** A one-cent drift between the two breaks *every* card order.
>
> - Line prices are re-resolved from the `products` table server-side — the browser cannot set a price.
> - **Shipping is server-authoritative** in `MEMI-Backend/src/shipping-rates.js`: `standard €5.90` (**free once goods after discount ≥ €100**), `express €8.90` (**never free**), `ritiro €0`. The browser sends only `shipping_method` and mirrors these constants for display. A configured `shipping_zones` row can override the standard rate/threshold; express stays a flat upgrade.
> - The free-shipping copy (drawer, ~35 storefront pages) mirrors the €100 threshold. **Change the server const → change the copy too.**
> - `bash verify/run.sh` **§7c** diffs the two implementations and fails on drift. Run it after touching either side.

The comparison happens per-provider in `routes/orders.js`: `expectedCents = Math.round(total * 100)`, then each branch requires the charged/authorised amount to equal `expectedCents` exactly and the currency to be EUR.

---

## Stripe

**PaymentIntent creation** — `POST /api/payments/create-intent` (`routes/payments.js`):
- `503` if `STRIPE_SECRET_KEY` unset; `400` if `amount_cents < 50` (Stripe €0.50 minimum).
- Default intent uses `automatic_payment_methods:{enabled:true}`.
- If the body carries `payment_method_types` (e.g. `['klarna']`), the intent is **restricted to exactly those types** so the Klarna tab doesn't surface every method enabled on the account.

**Order-time verification** (`routes/orders.js`, `payment_method:'carta'` + Stripe configured + `payment_intent_id`):
```
pi = stripe.paymentIntents.retrieve(payment_intent_id)
pi.status !== 'succeeded'                         → 402 "Pagamento non completato"
pi.currency !== 'eur' || pi.amount !== expected   → 402 "Importo del pagamento non corrisponde" (logged as possible tampering)
```

**Klarna** is a Stripe product here: the checkout mints a **dedicated klarna-only PaymentIntent** (`payment_method_types:['klarna']`), mounts a Stripe Payment Element, and redirects the buyer to Klarna. Because a Klarna intent is bound to a fixed amount, `refreshKlarnaElement()` **rebuilds it whenever the total drifts** (shipping change via back-nav, promo, gift card) — otherwise Klarna would authorise a stale total the server then rejects with 402. On return, `handleKlarnaReturn()` reads the redirect params and places the staged order on a `succeeded` **or** `processing` intent.

Klarna sends `payment_method:'klarna'` (not `'carta'`), so it has its **own** order-time verification branch (`routes/orders.js`) — separate from the card branch and, crucially, tolerant of `processing`:
```
pi = stripe.paymentIntents.retrieve(payment_intent_id)
pi.currency !== 'eur' || pi.amount !== expected   → 402 "Importo del pagamento non corrisponde" (logged as possible tampering)
pi.status === 'succeeded'                          → paymentStatus = 'pagato'
pi.status === 'processing'                         → paymentStatus = 'in_attesa'   // webhook payment_intent.succeeded promotes → 'pagato' when Klarna settles
otherwise (requires_action / canceled / …)         → 402 "Pagamento Klarna non completato"
```
Klarna authorises the buyer, then Stripe settles a moment later, so the return trip often carries a still-`processing` intent. Accepting `processing` (client and server) is what stops a slow Klarna settle from **dropping a paid order** — the order is created and tracked, and the webhook finalizes it. `STRIPE_SECRET_KEY` unset → the branch refuses Klarna with 503 rather than writing an unverified order.

**Webhook** — `POST /api/payments/webhook` (`stripeWebhookHandler`, mounted on `app` **before** `express.json()` so it gets the **raw body** for signature verification):
- `503` if `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` unset; `400` on bad signature.
- It is a **safety net, not the order-creation path** (orders are created by `POST /api/orders` after client-side confirm).
- `payment_intent.succeeded` **with a matching `in_attesa` order** → reconciled to `pagato` + `ensureInvoiceForOrder`. With **no** matching order → loud warning (customer charged, no order — manual follow-up; the handler will not guess an order from a bare PI).
- `charge.dispute.created` → logged for admin visibility, no automated action.

### Enabling Klarna — go-live checklist

Klarna has **no separate account, API key, or SDK** in MEMI — it is a Stripe payment method. "Turn on Klarna" = configure Stripe + flip Klarna on in the Stripe Dashboard. The code is fully wired (checkout "Paga in 3 rate" tab, klarna-only PaymentIntent, redirect return, dedicated server verify).

1. **Stripe keys** — Dashboard → Developers → API keys. Do it in **test** first (`sk_test_…` / `pk_test_…`), then **live** (`sk_live_…` / `pk_live_…`).
2. **Enable Klarna** — Dashboard → Settings → **Payment methods** → *Buy now, pay later* → **Klarna → On**. ⚠️ **Test and Live are separate toggles.** Until this is on, `create-intent` with `['klarna']` errors and the storefront tab shows *"Klarna non disponibile."*
3. **Backend env** (Coolify → backend service, or the root `.env` — `docker-compose.yml` forwards all three to the container):
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. **Webhook** — Dashboard → Developers → Webhooks → add endpoint `https://api.memi.testdemo.it/api/payments/webhook`, subscribe to `payment_intent.succeeded` + `charge.dispute.created`, copy its signing secret into `STRIPE_WEBHOOK_SECRET`. **Required for Klarna specifically**: a Klarna intent that returns `processing` is only promoted `in_attesa → pagato` by this webhook.
5. **Redeploy** the backend so it reads the new env.
6. **Verify** — `GET https://api.memi.testdemo.it/api/payments/config` returns your `publishableKey` and `providers.stripe:true`. Then on the live site pick "Paga in 3 rate", complete Klarna's flow, and confirm the order lands `pagato` (or `in_attesa` → `pagato` within seconds via the webhook).

**Eligibility caveats:** Klarna via Stripe needs the account activated in a Klarna-supported country (**Italy ✓**) and EUR (**✓**); a brand-new *live* account can hit a short Klarna review — **test mode works instantly**. Test only on the **HTTPS domain** — the Klarna redirect can't complete on `localhost` (the checkout says so explicitly).

**Residual edge (by design):** the order is created when the buyer returns from Klarna. If the buyer is charged but never returns (tab closed mid-redirect), no order is created and the webhook logs a loud *"charged, no order"* warning for manual follow-up — the handler will not fabricate an order from a bare PaymentIntent. Fully closing this would require creating a pending order *before* the redirect (a larger change, deferred).

---

## SumUp

The card option is the **embedded SumUp widget mounted in-page on the Pagamento step** (step 3), replacing Stripe Elements when SumUp is configured. Card data never touches MEMI servers.

**Flow** (`checkout.html` `initSumupCheckout` → `payment-providers.js` `createSumupCheckout`):
1. On reaching step 3 with the Carta tab active, load the SumUp SDK (`https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js`).
2. `POST /api/payments/sumup/create-checkout` with `amount_cents` and a validated `return_url`. Server creates a checkout (`checkout_reference = MEMI-<ts>-<rand>`, `currency EUR`, `merchant_code`) and returns `{ id, status }`.
3. `window.SumUpCard.mount({ checkoutId, showAmount:true, onResponse })`. On `success` + `body.status==='PAID'`, the client places the order with `sumup_checkout_id` attached.
4. **`redirect_url`** is passed to give 3-D Secure a **top-level-redirect escape hatch** — a challenge bounces the browser to the issuer and SumUp returns to `?checkout_id=…`, handled by `handleSumupReturn()` (which finalizes a *staged* order). Without it the widget attempts 3DS in a nested iframe, which third-party-cookie restrictions break (the Jul 2026 "ACS Method call 400"). If the SDK fails to load, checkout **falls back to Stripe Elements** — never a dead-end.

**Order-time verification** (`routes/orders.js`, `payment_method:'carta'` + `sumup_checkout_id` present):
```
info = getSumupCheckout(sumup_checkout_id)
info.status !== 'PAID'                                → 402
info.currency !== 'EUR' || info.amountCents !== exp   → 402
paymentRef = 'sumup_' + checkout_id                   // 'sumup_' prefix → unambiguous for refunds
```
The `sumup_` prefix on `payment_intent_id` is how the refund path (`resi.js`) tells a SumUp order (`sumup_…`) from a Stripe one (`pi_…`).

> ### ⚠️ SumUp test cards work ONLY on a SANDBOX merchant account
> This is a recurring support question. SumUp has **no separate sandbox host** — everything hits `https://api.sumup.com`. What decides test vs live is the **merchant account** behind `SUMUP_MERCHANT_CODE`:
> - **Sandbox merchant** (`MWJ0XBGY`): the checkout response carries `merchant_sandbox:true` and **test cards are accepted**.
> - **Live merchant** (`MRRCM5V4`): `merchant_sandbox` is absent/false and **test cards are declined** (the classic "bounces back to the form" symptom).
>
> Both `createSumupCheckout` and `getSumupCheckout` log `merchant_sandbox` to make this diagnosable. To run test payments locally, point `SUMUP_MERCHANT_CODE` (and matching API key) at the sandbox merchant.

**Hosted Checkout** (card entry + 3DS entirely on SumUp's page, returning `hosted_checkout_url`) is **retained only as a rollback** — the code path exists (`hosted:true` opt-in in `createSumupCheckout`, a commented block in `checkout.html`) but the storefront uses the embedded widget.

**Env:** `SUMUP_API_KEY` (secret Bearer), `SUMUP_MERCHANT_CODE`.

---

## Apple Pay / Google Pay (wallets)

One integration covers **both** wallets: Stripe's **Payment Request Button** (`stripeInstance.paymentRequest(...)` → `elements.create('paymentRequestButton')`). Safari with a card in Apple Wallet offers **Apple Pay**; Chrome / Android with a saved card offers **Google Pay**. There is **no redirect** — the buyer confirms in the native wallet sheet in-page. They render as **two separate rows** — Apple Pay (`#appleTab`, method `apple`) and Google Pay (`#gpayTab`, method `gpay`), each correctly branded, sharing the one Payment Request Button (moved into the active panel). `pr.canMakePayment()` marks whichever the device supports as usable (`result.applePay`→apple, `result.googlePay`→gpay). **The Apple Pay row is always visible** (owner's choice); on any non-Safari / non-Apple browser — where web Apple Pay is impossible — selecting it shows an *"Apple Pay only works in Safari…"* note (`#appleUnavailableNote`) instead of a dead button, and "Paga ora" surfaces the same message. The Google Pay row stays hidden until `canMakePayment()` confirms it. `disableWallets:['link','browserCard']` keeps Stripe Link from winning the button.

**Wallets ride on Stripe, not SumUp.** The sheet confirms against a **Stripe** PaymentIntent: `handleWalletPayment()` runs `confirmCardPayment(secret, { payment_method: ev.paymentMethod.id }, { handleActions:false })` (closes the sheet immediately, then runs 3DS only if the bank asks) and on `succeeded` places the order with the `payment_intent_id` attached. The order submits as `payment_method:'carta'`, so **server-side it takes the same Stripe card branch** as a typed card (`paymentIntents.retrieve` → `succeeded` + amount/currency match). The intent is the default card-capable one (`create-intent` with **no** `payment_method_types`).

> ### ⚠️ The wallet initialises independently of the Stripe card Element
> When **SumUp** is the card processor it owns the "Carta" tab and the Stripe card Element is never mounted — so the wallet button, which was initialised *inside* `initStripeElements()`, went dark and the Apple/Google Pay tab **never appeared** (bug fixed Jul 2026). The fix: **`initStripeWallet()`** sets up the Stripe instance + Payment Request Button **without** the card field, and is called in the SumUp branch of both the page-load config bootstrap (`fetchStripeConfig`) and the Pagamento-step entry. Wallets now work whether the card tab is Stripe **or** SumUp — they only need `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY`.

**No webhook needed:** wallet payments confirm synchronously in-page (the intent is `succeeded` before the order is placed), so — unlike Klarna — there is no `processing` state to reconcile. The Stripe webhook stays a safety net only.

**Diagnostic:** append **`?walletdebug=1`** to the checkout URL to paint Stripe-loaded / key-present / secure-context / `canMakePayment` result into the payment panel — the fastest way to see *why* a wallet is (or isn't) offered on a given device, no DevTools required.

### Enabling Apple Pay / Google Pay — go-live checklist

Both wallets are the **same Stripe integration** — no separate account, key, or SDK (like Klarna, they ride on Stripe). The code is fully wired; what remains is Stripe config, Apple's domain check, and testing on a wallet-capable device.

1. **Stripe keys** — the same `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` the Stripe-card / Klarna flows already use. If cards work, the keys are done; `GET /api/payments/config` must return your `publishableKey`.
2. **HTTPS is mandatory** — Apple Pay only appears in a secure context. It will **never** show on `http://` or plain `localhost` — test on the real HTTPS domain. (Google Pay in Chrome *does* work on `localhost` in test mode.)
3. **Register the domain for Apple Pay** — Stripe Dashboard → Settings → **Payment method domains** → *Add a domain* → `memi.testdemo.it`. Stripe.js auto-hosts the association in most setups; if verification fails, serve the file Stripe provides at `/.well-known/apple-developer-merchantid-domain-association`. **Google Pay needs no domain step.**
4. **Confirm the methods are on** — Dashboard → Settings → **Payment methods** → *Apple Pay* and *Google Pay* **On** (they default on with cards; **test and live are separate toggles**).
5. **Test on the right surface** — Apple Pay: **Safari** on a Mac (Touch ID / paired iPhone) or a real iPhone / iPad with a card in Wallet. Google Pay: **Chrome** (desktop / Android) with a saved card. The tab stays hidden on Firefox and on Chrome-for-Windows without a Google Pay card — **that's correct, not a bug.** Use `?walletdebug=1` to confirm detection.

---

## PayPal

Standard **Orders v2**: `create-order → buyer approves in popup → capture`. The convenience routes drive the PayPal JS SDK; the **source of truth is the server re-check in `POST /api/orders`**.

- `POST /api/payments/paypal/create-order` → `createPaypalOrder` (`intent:'CAPTURE'`, EUR). `503` unconfigured, `400` if `amount_cents < 50`.
- `POST /api/payments/paypal/capture` → `capturePaypalOrder`.

**Order-time verification** (`routes/orders.js`, `payment_method:'paypal'` + `payment_reference`):
```
info = inspectPaypalOrder(payment_reference)          // inspect WITHOUT capturing
status not APPROVED/COMPLETED                          → 402
currency !== 'EUR' || amountCents !== expected         → 402
COMPLETED  → paymentStatus = 'pagato' (idempotent retry, already captured)
APPROVED   → paypalCaptureAfterCommit = true           // capture ONLY after the order + atomic
                                                        // stock decrement commit
```
**Capture-after-commit** is deliberate: capturing before persistence could leave a buyer charged with no order if a concurrent oversell 409s. If the post-commit capture fails, the order is left `in_attesa` with a CRITICAL log for manual follow-up.

**Webhook** — `POST /api/payments/paypal/webhook` (JSON-parsed router):
- With `PAYPAL_WEBHOOK_ID` set → `verifyPaypalWebhook` (POSTs the event + `paypal-transmission-*` headers to `/v1/notifications/verify-webhook-signature`); a failed verification is **rejected (400)**.
- **Without `PAYPAL_WEBHOOK_ID` → the event is acknowledged (200) but NEVER reconciled** — a forged event could otherwise flip an order to `pagato`. Set it before going live.
- On a verified `CHECKOUT.ORDER.APPROVED` / `PAYMENT.CAPTURE.COMPLETED`, `reconcileByReference` flips a matching `in_attesa` order to `pagato` + emits the invoice.

**Env:** `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_ENV=sandbox|live`, `PAYPAL_WEBHOOK_ID` (required to trust webhooks).

### Enabling PayPal — go-live checklist

Unlike Klarna, PayPal is its **own** provider with **its own REST credentials** (separate from Stripe). The code is fully wired and verified: the checkout renders the official PayPal Buttons, `createOrder` uses the live cart total, `onApprove` places the order while PayPal keeps its own processing spinner, and `POST /api/orders` re-verifies the amount then **captures after the order commits** (a buyer is never charged without an order). PayPal stays hidden until credentials exist.

1. **Create a REST app** — developer.paypal.com → Apps & Credentials. Make a **Sandbox** app to test and a **Live** app for production; copy each app's **Client ID** and **Secret**.
2. **Backend env** (Coolify → backend service; `docker-compose.yml` forwards these):
   ```
   PAYPAL_CLIENT_ID=...
   PAYPAL_SECRET=...
   PAYPAL_ENV=sandbox        # set to 'live' with the LIVE app's credentials
   PAYPAL_WEBHOOK_ID=...      # from the webhook created in step 3
   ```
   ⚠️ `PAYPAL_ENV` **must match the credential type** — sandbox creds with `PAYPAL_ENV=live` (or vice-versa) fails auth on every call (wrong API host).
3. **Webhook** — in the same app add a webhook for `https://api.memi.testdemo.it/api/payments/paypal/webhook`, subscribe to `CHECKOUT.ORDER.APPROVED` + `PAYMENT.CAPTURE.COMPLETED`, and copy its **Webhook ID** into `PAYPAL_WEBHOOK_ID`. Without it, PayPal webhooks are acknowledged but **never** trusted to change order state (a forged event can't flip an order to paid).
4. **Redeploy** the backend.
5. **Verify** — `GET https://api.memi.testdemo.it/api/payments/config` returns `providers.paypal:true` and a `paypal.clientId`; the storefront PayPal tab then renders the live Buttons. Complete a full pay with a **sandbox buyer** (developer.paypal.com → Testing Tools → Sandbox Accounts) → order lands `pagato`. Live PayPal needs the PayPal **business** account approved for the store's country/currency (EUR).

---

## Invoicing (automatic)

`src/invoicing.js` — `ensureInvoiceForOrder(db, orderId)` emits a fiscal document **the first time an order becomes `pagato`**, so revenue never sits without an invoice. Called from checkout, admin order creation, admin status change, and both webhook reconciliations.

- Number format **`F-YYYY-NNNN`** (year-scoped, zero-padded), computed from `MAX()` with a one-retry guard on a concurrent numbering collision.
- **Idempotent** — skips if the order already has an invoice or isn't `pagato`.
- VAT model: prices are IVA-inclusive (22%); `imponibile = total / 1.22`, IVA extracted from the gross.
- **Opt-out:** `store_settings.auto_invoice = '0'` (default on).
- An invoicing failure is swallowed (logged) — it must **never** break the payment/order flow.

## Order compensation (undo side effects)

`src/order-compensation.js` — cancelling, deleting, or refunding an order must move back the four things order creation moved. Used by `PUT /orders/admin/:id/status` (annullato), `DELETE /orders/admin/:id`, `PUT /admin/resi/:id`, `POST /admin/resi/:id/refund`.

| Restored | Notes |
|---|---|
| **Stock** (`product_sizes`) | re-adds each sized line's qty |
| **Gift-card balance** | re-credits and re-activates a card depleted by the order |
| **Discount-code usage** | released on **cancel only** (global counter + per-email row) |
| **Loyalty points** | reversed via ledger storno, **idempotent** |
| **Customer totals** | denormalized `speso`/points corrected |

`annullato` is **terminal** (re-activating → 409). `DELETE` skips compensation if the order was already `annullato`/`rimborsato` (avoids double-compensation). All functions expect an **open transaction**; callers commit/rollback and guard against double-compensation with a status-transition check.

## Refunds

`POST /api/admin/resi/:id/refund` (`routes/resi.js`, `requireAdmin`):
- **Provider auto-detected** from `payment_intent_id`: `sumup_…` → `refundSumupCheckout`; otherwise a real `stripe.refunds.create`.
- **`{ manual: true }`** = money returned **outside** Stripe/SumUp (PayPal / Klarna / bonifico): skips the provider call but runs the **exact same bookkeeping**. A non-Stripe order with no `payment_intent_id` **requires** the manual path (400 otherwise).
- **Full** refund → order marked `rimborsato` + `compensateOrder` (stock/gift-card/loyalty restored). **Partial** refund → order stays a paid order (net of the slice); only the customer's `speso` is reduced, inventory adjusted manually.
- Every refund fires `sendRefundNotification` and writes an admin audit-log row.

---

## Email

`src/email.js` (nodemailer). **No-op contract:** if SMTP is not fully configured (**both** `SMTP_USER` *and* `SMTP_PASS` — a half-config with only `SMTP_USER` is treated as unconfigured and logs a warning), **every send function is a silent no-op that never throws**, so callers stay fire-and-forget.

**Transactional:** order confirmation, shipping confirmation, welcome, password reset, gift-card delivery, refund notification, **newsletter welcome** (`sendNewsletterWelcome`, fired best-effort from `POST /api/newsletter/subscribe`).

**Lifecycle engine** — `src/lifecycle.js` (campaigns) + `src/scheduler.js` (in-process daily runner, **no cron dependency**; hourly tick, batch at `LIFECYCLE_SEND_HOUR` local, default 09:00; idle without SMTP or with `DISABLE_EMAIL_SCHEDULER=1`). Started from `server.js` after migrations.

| Campaign | Trigger | Sends |
|---|---|---|
| `birthday` | customer's birthday today | personal % code |
| `winback` | ordered before, dormant (default 120 days) | "we miss you" + code |
| `points_reminder` | has redeemable loyalty points, idle | reminder of their € value |
| `anniversary` | 1+ year since registration | thank-you + small code |
| `new_season` | admin broadcast | to all consented customers (+ opted-in newsletter subs) |

**Three invariants on every send:**
1. **GDPR-gated** — only `customers.marketing_consent = 1` are ever targeted (season broadcast may also include opted-in newsletter subscribers).
2. **Idempotent** — a row is claimed in `email_events (type, dedup_key, email)` **before** sending, so no double-send across restarts/instances, and the claim precedes minting any discount code (no orphan codes).
3. **Best-effort** — silent no-op without SMTP.

Admin API (gated `requirePermission('marketing')`): `GET /api/admin/lifecycle`, `PUT /api/admin/lifecycle/settings`, `POST /api/admin/lifecycle/run` (`{dryRun}`), `POST /api/admin/lifecycle/:type/preview`, `POST /api/admin/lifecycle/season`. Tunables live in `store_settings` keys `lifecycle_*`.

---

*Consolidated from: integrations.md, admin/07-integrations.md, SECURITY.md (payments), DEPLOYMENT.md (payments).*
