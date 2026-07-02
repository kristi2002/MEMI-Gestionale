# MEMI — Gap Analysis Completo
*Aggiornato: Luglio 2026 — Sprint 2 (feature-completeness + hardening)*

---

## Riepilogo esecutivo

Il progetto MEMI Abbigliamento è composto da tre layer: **frontend e-commerce** (`Memi Abbigliamento/`), **pannello admin** (`MEMI/`), **backend Node.js** (`MEMI-Backend/`). Tutti i componenti principali sono implementati e funzionanti. Questo documento descrive lo stato attuale (luglio 2026) e i gap rimanenti verso una piattaforma completamente pronta per il deploy su Hetzner/Coolify.

---

## 1. Pagamenti — ✅ Completo

**Stato:** ✅ Stripe Elements con PaymentIntent verificato server-side.

- Checkout con `CardElement` Stripe → `POST /api/payments/create-intent` → `stripe.confirmCardPayment()`
- Solo dopo Stripe successo: `MemiAPI.orders.place()` con `payment_intent_id`
- Backend verifica PaymentIntent (status + amount + currency) prima di salvare l'ordine
- `payment_intent_id` UNIQUE in DB → nessun replay possibile
- `payment_status='pagato'` impostato dopo verifica Stripe riuscita
- Errori Stripe mostrati in italiano al cliente
- Degradazione graziosa: senza `STRIPE_SECRET_KEY` → `/api/payments/create-intent` ritorna 503

**Endpoint:** `POST /api/payments/create-intent`, `GET /api/payments/config`

---

## 2. Pannello Admin — ✅ 22+ viste con dati reali

**Stato:** ✅ Tutte le sezioni principali leggono dall'API. Viste "fantasma" nascoste.

Pattern `_origRenderView`: intercetta ogni `renderView(name)`, carica dati dall'API, aggiorna `DATA`, chiama il renderer originale. Su errore API → stato vuoto onesto (non mock data).

### Stato viste per sezione

| Sezione | Stato |
|---|---|
| Dashboard (KPI + grafico) | ✅ Reale — dashboard/kpis + chart + top-products |
| Ordini | ✅ Reale — lista + dettaglio + ship + status update |
| Resi | ✅ Reale — lista + dettaglio + rimborso Stripe in-app |
| Fatture | ✅ Reale — generazione + F-YYYY-NNNN numerazione |
| Prodotti | ✅ Reale — CRUD + upload immagini (sharp → WebP) |
| Inventario | ✅ Reale — stock per taglia, aggiornabile |
| Clienti | ✅ Reale — lista + storico ordini, VIP calcolato |
| Sconti & Coupon | ✅ Reale — CRUD (%, fisso, spedizione gratuita) |
| Spedizioni / Zone / Corrieri | ✅ Reale — zone + corrieri + statistiche da shipments |
| Loyalty | ✅ Reale — punti + ledger + riscatto → codice sconto |
| Reviews | ✅ Reale — lista + pubblica/rifiuta/risposta admin |
| Campagne marketing | ✅ Reale — CRUD campagne + metriche |
| Newsletter | ✅ Reale — lista iscritti |
| CMS pages + Blog | ✅ Reale — editor CRUD |
| Gift Cards | ✅ Reale — CRUD saldi |
| Impostazioni store | ✅ Reale — nome, email, IVA, policy resi |
| Staff | ✅ Reale — gestione account admin |
| Bozze (= ordini in_attesa) | ✅ Parziale — visualizzazione solo |
| Collections / Categorie | ✅ Parziale — conteggi live, read-only |
| Analytics | ⚠️ Parziale — KPIs reali; sorgenti traffico richiedono GA4 |
| Tracking spedizioni | ⚠️ Parziale — ricerca nelle proprie spedizioni; nessuna API corriere esterna |
| Chat clienti | ❌ Nascosta — nessun backend |
| Automazioni / Pop-up | ❌ Nascosta — nessun backend |

---

## 3. Backend — ✅ Tutte le route implementate

**Stato:** ✅ Completo (Luglio 2026, Sprint 2)

| Route | File | Stato |
|---|---|---|
| `POST /api/auth/register` | auth.js | ✅ |
| `POST /api/auth/login` | auth.js | ✅ |
| `GET /api/auth/me` | auth.js | ✅ |
| `PUT /api/auth/me` | auth.js | ✅ |
| `POST /api/auth/forgot-password` | auth.js | ✅ |
| `POST /api/auth/reset-password` | auth.js | ✅ |
| `GET /api/auth/loyalty` | auth.js | ✅ |
| `POST /api/auth/loyalty/redeem` | auth.js | ✅ |
| `GET /api/products` | products.js | ✅ filtri: categoria/colore/saldi/novita/collection |
| `GET /api/products/:id` | products.js | ✅ con taglie + stock |
| `POST /api/orders` | orders.js | ✅ Stripe verify + stock check + stock deduct + email |
| `POST /api/orders/validate-discount` | orders.js | ✅ preview codice sconto |
| `GET /api/orders/my` | orders.js | ✅ richiede login |
| `GET /api/orders/my/:id` | orders.js | ✅ dettaglio ordine cliente |
| `GET /api/orders/track` | orders.js | ✅ lookup pubblico per numero + email (guest) |
| `POST /api/payments/create-intent` | payments.js | ✅ |
| `GET /api/payments/config` | payments.js | ✅ pk Stripe |
| `GET /api/shipping/zones` | shipping.js | ✅ |
| `GET /api/shipping/couriers` | shipping.js | ✅ |
| `GET /api/reviews/product/:id` | reviews.js | ✅ recensioni pubblicate |
| `POST /api/reviews` | reviews.js | ✅ submit recensione |
| `POST /api/resi/request` | resi-public.js | ✅ richiesta reso self-service |
| `POST /api/newsletter/subscribe` | newsletter.js | ✅ |
| `/api/cms/published/*` | cms.js | ✅ pagine pubbliche CMS |
| Tutti gli endpoint `/api/admin/*` | vari | ✅ 50+ endpoint admin |

**Gap backend:** nessuno.

---

## 4. Catalogo prodotti — ✅ Completamente dinamico

**Stato:** ✅ Tutte le superfici leggono dall'API.

- `shop.html` → `GET /api/products` (filtri multipli)
- `product.html` → `GET /api/products/:id` (con taglie + stock)
- `collections/{slug}/` → `GET /api/products?collection={slug}` via `catalog-loader.js`
- `best-seller.html` → `GET /api/products` ordinati per popolarità
- Immagini: upload admin → sharp → WebP → `/api/uploads/` → mostrate su shop, PDP, ricerca, drawer
- `productsData.js` non è più caricato da nessuna pagina cliente

---

## 5. Gestione ordini — ✅ Ciclo di vita completo

**Stato:** ✅ Implementato

1. Stripe addebita la carta → verifica server-side
2. Stock verificato per taglia prima di accettare l'ordine (400 se insufficiente)
3. `POST /api/orders` → DB: orders + order_items + discount_usage
4. Stock scalato per ogni variante (`GREATEST(0, stock - qty)`)
5. Email conferma ordine inviata al cliente
6. Admin vede l'ordine in tempo reale
7. Admin spedisce → email tracking al cliente con link corriere
8. Rimborso: admin clicca "Rimborsa via Stripe" → `POST /api/admin/resi/:id/refund`

**Gap:** nessuno.

---

## 6. Email — ✅ Completamente implementate

**Stato:** ✅ Tutte le email implementate in `src/email.js`

| Trigger | Email |
|---|---|
| `POST /api/orders` (pagato) | Conferma ordine al cliente |
| `PUT /api/admin/orders/:id/ship` o `POST /api/shipping/shipments` | Tracking + link corriere |
| `POST /api/auth/register` | Benvenuto cliente |
| `POST /api/auth/forgot-password` | Reset password (JWT 1h) |

- Silent no-op se `SMTP_USER` non impostato
- `FRONTEND_URL` usato nei link email (reset password, conferma ordine)

---

## 7. Autenticazione — ✅ Completa

**Stato:** ✅ JWT per clienti + admin separati.

- Clienti: `memi_token` in localStorage, `requireCustomer` middleware
- Admin: `memi_admin_token` in localStorage, `requireAdmin` middleware
- Admin bootstrap da env (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) con warning se default attive
- Reset password: JWT 1h → `reset-password.html` → `POST /api/auth/reset-password`

---

## 8. Tracking ordini — ✅ Completo

**Stato:** ✅ Sia per clienti loggati che per guest.

**Funzionante:**
- `GET /api/orders/my` restituisce `tracking_number` + `courier_code` per ogni ordine
- `account.html` mostra il badge tracking con link corriere
- Email spedizione inviata automaticamente con tracking
- `GET /api/orders/track?number=XXX&email=YYY` — lookup pubblico senza login; include `tracking_url` costruita dal template corriere
- `order-tracking.html` — pagina pubblica con form numero+email, timeline visiva 4 stati, sezione tracking corriere con link, griglia info ordine

---

## 9. Inventario — ✅ Completo

**Stato:** ✅ Stock enforced sia lato acquisto che lato UI.

- `product_sizes` table: stock per variante taglia
- Admin può aggiornare stock per taglia
- `POST /api/orders` controlla `stock >= qty` per taglia prima di accettare (→ 400 se insufficiente)
- `POST /api/orders` scala lo stock: `UPDATE product_sizes SET stock = GREATEST(0, stock - qty)`
- `GET /api/products/:id` restituisce le taglie con il relativo stock
- `product.html` già renderizza taglie con `stock <= 0` come pulsante `oos` (disabilitato, barrato) nella funzione `hydrate()`

---

## 10. Upload immagini admin — ✅ Completo

**Stato:** ✅ Implementato e funzionante.

- **Ricezione:** `multer` (memory), campo `images`, max `MAX_UPLOAD_MB` (default 8 MB), max 10 file
- **Elaborazione:** `sharp` → WebP responsive (`thumb`/`card`/`full`), auto-orienta da EXIF, nomi hash-content
- **Storage:** volume Docker `uploads_data` montato su `UPLOADS_DIR` (`/app/uploads`)
- **Serving:** `express.static` su `GET /api/uploads/<file>` (immutable, 365d cache)
- **Admin UI:** `AdminAPI.products.uploadImages()` (FormData) in `admin-api.js`
- Immagini mostrate su: shop grid, PDP, ricerca, cart drawer, wishlist drawer

---

## 11. Pagine storefront — ✅ Tutte le pagine complete

| Pagina | Stato |
|---|---|
| `index.html` | ✅ Completa con SEO JSON-LD |
| `shop.html` | ✅ Catalogo dinamico con filtri |
| `product.html` | ✅ PDP completa + sezione recensioni (display + form submit) |
| `checkout.html` | ✅ Stripe Elements + discount code + order |
| `account.html` | ✅ Storico ordini + tracking |
| `returns.html` | ✅ Policy + form self-service (chiama `/api/resi/request`) |
| `order-tracking.html` | ✅ Ricerca ordine per numero + email + timeline stati + link corriere |
| `forgot-password.html` | ✅ Completa |
| `reset-password.html` | ✅ Completa |
| `size-guide.html` | ✅ Guida taglie IT/EU/FR/UK/US |
| `about.html` | ✅ Pagina chi siamo |
| `privacy.html` | ✅ Privacy policy |
| `blog.html` | ✅ Lista articoli blog (CMS) |
| `articolo.html` | ✅ Dettaglio articolo blog |
| `404.html` | ✅ Pagina 404 |
| `editoriali.html` + 3 editoriali | ✅ Redesign luglio 2026 |
| `collections/` (15 pagine) | ✅ Dinamiche via catalog-loader.js |
| `best-seller.html` | ✅ Dinamica |
| `estate-2025.html` | ✅ Dinamica |

---

## 12. Recensioni prodotto — ✅ Completo

**Stato:** ✅ Backend + UI sulla PDP.

- `POST /api/reviews` — submit recensione (pubblica, opzionalmente autenticata)
- `GET /api/reviews/product/:id` — recensioni pubblicate per un prodotto
- `MemiAPI.reviews.forProduct(id)` e `MemiAPI.reviews.submit(data)` in `api-client.js`
- Admin: lista + pubblica/rifiuta + risposta admin
- `product.html`: sezione `#reviews` con riepilogo (rating medio + conteggio), elenco recensioni con stelle, eventuali risposte admin, form submit (stelle, nome, email, titolo, testo); recensioni caricate dopo `hydrate(p)` via `loadReviews(p.id)`

**Ancora mancante:**
- ⚠️ Rating medio non mostrato nella card prodotto nelle griglie (richiederebbe un secondo campo nel `GET /api/products` o un join aggregato)

---

## 13. Newsletter — ✅ Cablata su tutte le pagine

**Stato:** ✅ Form presente e wired in tutte le pagine tramite il footer iniettato.

- `POST /api/newsletter/subscribe` — salva in `newsletter_subscribers`
- `app.js` `injectFooter()` ora include un form `.newsletter-form` nella sezione `.sf2-brand`
- `wireNewsletterForms()` (già esistente in `app.js`) si aggancia automaticamente al form iniettato
- Admin lista iscritti

---

## 14. Gift cards — ⚠️ Solo admin CRUD

**Stato:** ⚠️ Admin può creare/gestire gift card, ma non sono riscattabili al checkout.

- `gift_cards` table: `code`, `balance`, `stato`
- `GET/POST/PUT/DELETE /api/admin/giftcards` — admin CRUD
- ❌ Nessun endpoint di validazione pubblica (`GET /api/giftcards/validate/:code`)
- ❌ Checkout non supporta riscatto gift card
- ❌ Nessuna email di consegna gift card

---

## 15. Infrastruttura & Hetzner — ✅ Pronta per il deploy

**Stato:** ✅ Hardened e verificata.

**Implementato:**
- `docker-compose.yml`: 4 servizi (mysql, backend, ecommerce, admin), health-check, restart policies, volumi persistenti
- Traefik TLS (Let's Encrypt) via Coolify — HSTS gestito da Traefik a livello proxy
- Backend: helmet, CORS, rate-limiting Express, graceful shutdown SIGTERM
- Schema self-heal a ogni boot (`db/migrations.js`)
- Admin bootstrap da env con warning default credentials
- `uploads_data` volume separato per immagini prodotto
- `verify/run.sh` per verifica sintassi + contract + ordine simulato
- `nginx.conf` storefront: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, gzip
- `nginx.conf` admin: stessi header corretti in ogni location block (fix: nginx ignora header a livello server se il location block ne definisce di propri)

**Da fare prima del go-live (operativo, non codice):**
- ⚠️ `ADMIN_EMAIL`/`ADMIN_PASSWORD` da impostare in Coolify
- ⚠️ `FRONTEND_URL` da impostare per link corretti nelle email
- ⚠️ Script backup DB (crontab) — template documentato in `docs/PRODUCTION-READINESS.md §6`

---

## Stato sprint Luglio 2026 — tutto completato

### ✅ Sprint 1 (deploy-readiness)
- Stripe payment → `pagato`, prezzo re-risolto da DB, replay protection
- Input validation 4xx, admin bootstrap, loyalty ledger
- API path fix (ordini/recensioni/resi)
- Design footer, editoriali, SEO JSON-LD, robots.txt, sitemap.xml

### ✅ Sprint 2 (feature-completeness + hardening)
- `GET /api/orders/track` + `order-tracking.html` con timeline visiva
- Stock check pre-ordine in `POST /api/orders`
- Sezione recensioni completa su `product.html`
- Newsletter form nel footer iniettato (tutte le pagine)
- Link "Traccia il tuo ordine" nel footer
- Nginx: `Referrer-Policy` + `Permissions-Policy` in entrambi i config

### 🟡 Nice to have (future sprint)
1. Gift card riscatto al checkout + email invio
2. GA4 integration per analytics traffico
3. Timeline visiva stati ordine in `account.html`
4. Rating medio prodotto nelle card griglia
5. Courier API esterna per tracking real-time
