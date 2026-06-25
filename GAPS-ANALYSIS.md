# MEMI — Gap Analysis Completo
*Aggiornato: Giugno 2026 (post sprint 2 — email, catalogo dinamico, account tracking, newsletter, SEO, admin mobile)*

---

## Riepilogo esecutivo

Il progetto MEMI Abbigliamento è composto da tre layer distinti: il **frontend e-commerce** (`Memi Abbigliamento/`), il **pannello admin** (`MEMI/`), e il **backend Node.js** (`MEMI-Backend/`). Dopo il sprint completo di Giugno 2026: il frontend ha pagamenti Stripe reali, filtri multi-selezione, mega-menu Editoriali, e view-toggle; il backend ha tutti i route implementati inclusi pagamenti ed email; il pannello admin carica dati reali dal backend tramite il pattern `_origRenderView` override.

---

## 1. Pagamenti — ✅ Implementato con Stripe

**Stato:** ✅ Risolto (Giugno 2026)

Il checkout usa **Stripe Elements** con il flusso PaymentIntent:
- `checkout.html` monta un `CardElement` Stripe; al submit chiama `POST /api/payments/create-intent`
- Ottiene `client_secret`, poi `stripe.confirmCardPayment()` — carta addebitata lato Stripe
- Solo dopo successo Stripe chiama `MemiAPI.orders.place()` con `payment_intent_id`
- `orders.js` verifica il PaymentIntent tramite Stripe SDK prima di salvare l'ordine nel DB
- Errori Stripe (carta rifiutata, fondi insufficienti) mostrati all'utente in italiano
- Backend risponde 503 se `STRIPE_SECRET_KEY` non è impostata (nessun crash)

**Env vars richiesti:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`

---

## 2. Pannello Admin — ✅ Dati reali integrati

**Stato:** ✅ Risolto (Giugno 2026)

Il file `MEMI/js/app.js` usa il pattern `_origRenderView` override: intercetta ogni `renderView(name)` e carica prima i dati reali dal backend, poi popola il `DATA` object e chiama il render originale. Su errore API, cade sul render con mock data come fallback.

### 2.1 Sezioni del pannello e loro stato

| Sezione sidebar | Stato attuale |
|---|---|
| Dashboard (KPI, grafico vendite) | ✅ Reale — `AdminAPI.dashboard.kpis()` + `recentOrders()` |
| Ordini | ✅ Reale — `AdminAPI.orders.list()` con trasformazione campi DB |
| Ordini bozze / abbandonati | ✅ Reale — filtro per `order_status` |
| Prodotti | ✅ Reale — `AdminAPI.products.listAll()` (status=all) |
| Inventario | ✅ Reale — stessa API, vista filtrata |
| Clienti | ✅ Reale — `AdminAPI.customers.list()`, VIP calcolato (spent > 300) |
| Sconti & Coupon | ✅ Reale — `AdminAPI.discounts.list()` |
| Spedizioni / Zone / Corrieri | ✅ Reale — `AdminAPI.shipping.zones()` + `.couriers()` + `.shipments()` |
| Marketing/Newsletter | ⚠️ Mock (non prioritario) |
| Chat / Messaggi | ⚠️ Mock (non implementato) |
| Analytics | ⚠️ Grafici SVG statici |
| Finanza, CMS, Canali | ⚠️ Non implementati |

### 2.2 Pattern implementato

`_origRenderView = renderView` salva il renderer originale. L'override intercetta ogni chiamata a `renderView(name)`, chiama l'API appropriata, aggiorna `DATA`, poi chiama `_origRenderView(name)`. Su `.fail()` cade sul render con mock data come fallback sicuro.

---

## 3. Backend — ✅ Tutti i route implementati

**Stato:** ✅ Completo (Giugno 2026)

Tutti i route che il frontend richiede sono implementati:

| Route | File | Stato |
|---|---|---|
| `POST /api/auth/register` | `auth.js` | ✅ |
| `POST /api/auth/login` | `auth.js` | ✅ |
| `GET /api/auth/me` | `auth.js` | ✅ |
| `GET /api/products` | `products.js` | ✅ |
| `POST /api/orders` | `orders.js` | ✅ + Stripe verify + inventory deduct + email |
| `GET /api/orders/my` | `orders.js` | ✅ |
| `GET /api/admin/customers` | `customers.js` | ✅ |
| `GET /api/shipping/zones` | `shipping.js` | ✅ |
| `POST /api/payments/create-intent` | `payments.js` | ✅ (nuovo) |
| `GET /api/admin/dashboard/kpis` | `dashboard.js` | ✅ |
| `GET /api/admin/dashboard/recent-orders` | `dashboard.js` | ✅ |

---

## 4. Catalogo prodotti — ✅ Dinamico (shop.html)

**Stato:** ✅ Risolto per shop.html (Giugno 2026) — collections/ ancora statiche

`shop.html` ora carica i prodotti dinamicamente tramite `GET /api/products`. La funzione `initShopCatalog()` (IIFE in fondo a shop.html) costruisce le card con i `data-*` attributes corretti che il motore di filtro legge. Il banner editoriale viene re-inserito dopo la 4ª card come nella versione statica. Il motore filter+pagination rimane invariato.

**Ancora statico:**
- Le 15 pagine `collections/{slug}/index.html` hanno ancora card HTML statiche
- `productsData.js` ancora usato da `search.html`

**Aggiornamento automatico:** da oggi i prodotti creati dall'admin appaiono automaticamente in shop.html dopo il refresh.

---

## 5. Gestione ordini — ✅ Ciclo di vita completo

**Stato:** ✅ Implementato (Giugno 2026)

Flusso completo quando un cliente fa un ordine:
1. Stripe addebita la carta tramite PaymentIntent
2. `MemiAPI.orders.place()` → `POST /api/orders` verifica il PaymentIntent
3. Ordine salvato in DB (`orders` + `order_items`)
4. Inventario scalato per ogni variante ordinata (`UPDATE product_sizes SET stock = stock - qty`)
5. Email di conferma inviata al cliente (`email.js` + nodemailer)
6. L'admin vede il nuovo ordine nella vista Ordini (dati reali)

---

## 6. Email e notifiche — ✅ Implementato completamente

**Stato:** ✅ Tutte le email implementate (Giugno 2026)

| Funzione | Trigger | Stato |
|---|---|---|
| Conferma ordine | `POST /api/orders` (dopo acquisto) | ✅ |
| Spedizione + tracking | `PUT /api/orders/admin/:id/ship` | ✅ |
| Benvenuto alla registrazione | `POST /api/auth/register` | ✅ |
| Reset password | `POST /api/auth/forgot-password` | ✅ |

- Tutte le funzioni sono in `src/email.js` — esportate singolarmente
- Silenziosamente non-operative se `SMTP_USER` non impostato
- Flusso reset password: JWT a 1 ora → `reset-password.html` frontend → `POST /api/auth/reset-password`
- Newsletter: `POST /api/newsletter/subscribe` salva in tabella `newsletter_subscribers`

**Env vars richiesti:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

---

## 7. Autenticazione cliente — ✅ Completo

**Stato:** ✅ Implementato (Giugno 2026)

- Register, login, me, updateMe — tutti funzionanti con JWT
- Email di benvenuto inviata alla registrazione
- Recupero password: `POST /api/auth/forgot-password` → JWT 1h → `reset-password.html` → `POST /api/auth/reset-password`

---

## 8. Tracking ordini — ✅ Parzialmente implementato

**Stato:** ✅ Tracking in account.html (Giugno 2026)

- `account.html` mostra i propri ordini con status badge
- Quando `order_status = 'spedito'` e `tracking_number` esiste, appare il row tracking con corriere + numero
- API `/api/orders/my` già restituisce `tracking_number` e `courier_code`
- Email di spedizione inviata automaticamente quando admin clicca "Spedisci" nel pannello

**Ancora mancanti:**
- Pagina tracking pubblica (senza login) per guest orders
- Timeline visiva dello stato (In attesa → In preparazione → Spedito → Consegnato)
- Gestione resi self-service

---

## 9. Inventario — ✅ Deducibile su acquisto

**Stato:** ✅ Parzialmente implementato (Giugno 2026)

- `product_sizes` table contiene `stock` per variante taglia
- `POST /api/orders` deduce stock per ogni item ordinato: `UPDATE product_sizes SET stock = stock - qty WHERE product_id=? AND taglia=?`
- Ancora mancanti: alert "esaurito" automatico nella UI, blocco acquisto se stock = 0

---

## 10. Upload immagini admin — Assente

**Stato:** ❌ Non implementato

L'admin non ha un sistema di upload immagini prodotto. Le immagini attuali sono URL Unsplash (placeholder). Per aggiungere prodotti reali servirebbe:
- Un componente upload nel pannello admin
- Storage (es. AWS S3, Cloudinary, o cartella locale)
- Endpoint `POST /api/upload` nel backend

---

## 11. Pagine orfane o incomplete

| Pagina | Problema | Stato |
|---|---|---|
| `campagne.html` | Orfa​na | ✅ Redirect a editoriali.html via meta-refresh |
| `account.html` | Esisteva senza tracking | ✅ Ora mostra tracking spedizione |
| `size-guide.html` | Non esisteva | ✅ Creata con tabelle IT/EU/FR/UK/US |
| `reset-password.html` | Non esisteva | ✅ Creata (flusso reset password) |
| `order-tracking.html` | Non esiste (guest tracking) | ❌ Ancora mancante |
| `returns.html` | Non esiste | ❌ Ancora mancante |
| `product.html` (root) | Orfa​no, query param ?id= | ❌ Ancora orfano |

---

## 12. Recensioni prodotto — Assenti

**Stato:** ❌ Non implementato

Nessuna sezione recensioni nelle schede prodotto. Mancano:
- UI per lasciare recensione
- Backend per salvarle
- Moderazione admin

---

## 13. Sincronizzazione `productsData.js`

**Stato:** ⚠️ Rischio

Il file `productsData.js` è la "fonte di verità" per cart/wishlist/filtri. Se un prodotto viene modificato nell'admin (quando l'admin avrà un'integrazione reale), il file JS non si aggiornerà automaticamente. Serve un meccanismo di sync o abbandonare il file statico a favore di chiamate API.

---

## 14. Problemi tecnici minori

- **`app.js` versioning:** `?v=7` in tutti e 56 i file HTML — aggiornare a v=8 se si modifica app.js
- **Immagini:** tutte le immagini prodotto sono placeholder Unsplash; il campo `images` in DB è JSON — admin non ha ancora UI upload
- **SEO:** ✅ index.html e shop.html hanno og:tags + JSON-LD; ✅ vestito-lino-cannes ha JSON-LD Product; gli altri 22 PDP mancano ancora — aggiungere con template uguale
- **Performance:** shop.html ora carica da API (nessun JS hardcoded); `productsData.js` ancora usato solo da search.html
- **Admin mobile:** ✅ `MEMI/css/style.css` ha breakpoint 600px (bottom nav) + 600–920px (collapsed sidebar)
- **Newsletter:** ✅ `POST /api/newsletter/subscribe` + tabella DB; il form footer di shop.html è cablato; altri footer (iniettati da app.js) ancora non cablati

---

## Priorità suggerite

### ✅ Sprint 1 — Risolto (Giugno 2026)
1. ~~Pagamenti reali (Stripe)~~ → **✅ Stripe Elements + PaymentIntent**
2. ~~Salvataggio ordini nel backend~~ → **✅ orders.js completo**
3. ~~Email conferma ordine~~ → **✅ nodemailer in email.js**
4. ~~Autenticazione cliente~~ → **✅ JWT implementato**
5. ~~Admin dati reali~~ → **✅ _origRenderView pattern**
6. ~~Inventario deducibile~~ → **✅ stock decrementato su acquisto**

### ✅ Sprint 2 — Risolto (Giugno 2026)
7. ~~Catalogo dinamico shop.html~~ → **✅ API-driven con initShopCatalog()**
8. ~~Email spedizione con tracking~~ → **✅ sendShippingConfirmation()**
9. ~~Recupero password~~ → **✅ forgot/reset con JWT 1h + reset-password.html**
10. ~~Email di benvenuto~~ → **✅ sendWelcomeEmail() su register**
11. ~~Tracking ordini in account~~ → **✅ courier + tracking_number visualizzati**
12. ~~Newsletter backend~~ → **✅ POST /api/newsletter/subscribe + tabella DB**
13. ~~Guida taglie~~ → **✅ size-guide.html creata**
14. ~~SEO meta tags~~ → **✅ og:tags + JSON-LD su index/shop/PDP**
15. ~~Admin mobile~~ → **✅ breakpoint 600px bottom nav in style.css**

### 🟠 Prossimo sprint — ancora mancanti
- Catalogo dinamico per le 15 collections/ (ancora statiche)
- Upload immagini nel pannello admin (campo `images` JSON va impostato manualmente)
- Tracking pubblico guest (senza login) — `order-tracking.html`
- Gestione resi self-service
- Recensioni prodotto (UI + backend + moderazione)
- SEO per i rimanenti 22 PDP (copiare template da vestito-lino-cannes)
- Newsletter nell'header/footer iniettato da app.js (ora solo shop.html è cablato)
