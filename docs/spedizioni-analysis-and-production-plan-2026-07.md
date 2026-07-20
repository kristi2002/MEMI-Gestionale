# Spedizioni — Analisi profonda & piano di produzione (Luglio 2026)

> Analisi verificata sul codice reale (backend `MEMI-Backend/src`, admin React
> `MEMI-Admin/src`, storefront `Memi Abbigliamento/`) il 2026-07-19. Copre le 4
> pagine dell'area **Spedizioni** dell'admin — Corrieri, Spedizioni in corso,
> Zone & Tariffe, Punti di ritiro — più il loro impatto reale su checkout,
> ordini e cliente. Confrontata con il modello di Shopify e WooCommerce.

## TL;DR — stato reale

| Pagina | Fa qualcosa di reale? | Verdetto |
|---|---|---|
| **Corrieri** | Sì — `tracking_url_template` costruisce il link di tracking; `attivo` filtra la lista pubblica. **`rate` NON è usato in nessun calcolo prezzo.** | Funziona ma con lacune (vedi §1) |
| **Spedizioni in corso** | **Sì, non è solo visuale** — cambia lo stato ordine, rispecchia "consegnato", persiste il tracking, invia email su alcuni percorsi (vedi §2) | Funziona, con incoerenze |
| **Zone & Tariffe** | Sì — una zona *può* sovrascrivere prezzo standard + soglia gratis al checkout… **ma il matching per paese è rotto** (vedi §3) | Bug reale da correggere |
| **Punti di ritiro** | **No lato cliente** — il checkout ha un "Ritiro in negozio" hardcoded che NON legge `pickup_points` (vedi §4) | Solo data-entry, da collegare |

---

## 1. Corrieri — cosa manca per essere "bulletproof"

### Come funziona oggi
- Tabella `couriers`: `code` (PK, immutabile), `nome`, `slug`/sigla, `rate` (DECIMAL, default 6.00), `attivo`, `tracking_url_template`.
- CRUD completo nell'admin (crea/modifica/elimina, elimina in blocco, export).
- Tracking live: **un solo adapter, BRT** (`src/courier-tracking.js`). Gli altri corrieri → nessun adapter → `refresh-tracking` risponde **503** con toast gentile. Esiste una modalità `COURIER_TRACKING_SIMULATE=1` per demo offline.
- Il link di tracking si costruisce sostituendo `{tracking}` nel template.

### Lacune (in ordine di importanza)
1. **`rate` non è collegato a niente.** Verificato: il prezzo di spedizione al checkout viene SEMPRE da `src/shipping-rates.js` (per *metodo*: standard/express/ritiro) o da una zona — **mai** da `couriers.rate`. Il cliente non sceglie il corriere; è l'admin ad assegnarlo alla spedizione. Quindi il campo "Tariffa €" è **decorativo e fuorviante**. → O lo si collega a un vero motore di tariffe per corriere (grosso), o lo si ri-etichetta come "costo interno indicativo".
2. **`DELETE` corriere senza guardia sui riferimenti.** `DELETE FROM couriers WHERE code=?` non controlla nulla. `shipments.courier_code` e `orders.courier_code` sono VARCHAR **senza foreign key** → eliminare un corriere in uso orfaniza quei riferimenti: il link di tracking diventa `null` silenziosamente e il badge mostra il codice grezzo. → Bloccare l'eliminazione (409) se il corriere è referenziato, oppure fare soft-delete (`attivo=0`).
3. **Nessuna validazione di `tracking_url_template`.** Testo libero: un template senza `{tracking}` o non-URL produce un link rotto/nullo senza avvisare. → Validare che sia un URL e avvisare se manca `{tracking}`.
4. **Un solo adapter di tracking (BRT).** Il checkout dice "Tracciata con BRT / GLS" ma **GLS non ha adapter**. → Aggiungere adapter (GLS, Poste, DHL, InPost…) o integrare un aggregatore (AfterShip / TrackingMore / Ship24) con un unico adapter generico.
5. **Nessun legame corriere ↔ metodo/zona.** Non esiste "standard = BRT, express = DHL": l'assegnazione è manuale per ordine. → Opzionale ma utile per l'automazione.
6. **Mancano: logo/branding, orari di cut-off, livelli di servizio, corriere di default, audit sul CRUD corrieri** (l'azione "spedisci" è già in audit-log, il CRUD corrieri no).

---

## 2. Spedizioni in corso — fa qualcosa in background? **Sì.**

Non è una pagina puramente visuale. Effetti reali verificati:

- **La tabella `shipments` si popola automaticamente** quando un ordine viene spedito:
  - `PUT /api/orders/admin/:id/ship` (azione "Spedisci" sull'ordine) fa `INSERT … ON DUPLICATE KEY UPDATE` di una riga shipment, imposta `order_status='spedito'`, scrive `courier_code`/`tracking_number` sull'ordine, logga in audit, e **fa partire le automazioni** ordine-spedito.
  - `POST /api/shipping/shipments` crea una spedizione **e invia l'email di conferma spedizione** col deep-link di tracking.
- **Il menu a tendina "Stato"** (`PUT /api/shipping/shipments/:id`) persiste lo stato di lifecycle del corriere; se impostato a **`consegnato`** rispecchia sull'ordine (`order_status='consegnato'`) dentro la stessa transazione.
- **"Aggiorna"** (`POST /api/orders/admin/:id/refresh-tracking`) tira lo stato **live dal corriere** (adapter BRT o SIMULATE), lo persiste, e se `consegnato` promuove l'ordine **e invia l'email** di aggiornamento stato. Config-gated: 503 se nessun adapter/credenziali.

### Incoerenze/lacune
- **Email "consegnato" solo su un percorso.** Il refresh-dal-corriere invia l'email; il cambio manuale a `consegnato` dal menu **non** invia nulla. → Unificare (mandare l'email di consegna anche sul percorso manuale).
- **Nessun pulsante "crea spedizione" nella pagina Spedizioni.** L'endpoint `POST /shipping/shipments` esiste ma la pagina React è solo lettura + cambio stato + refresh. Le spedizioni nascono solo dall'azione "Spedisci" sull'ordine.
- **ETA non modificabile in UI.** L'API accetta `eta`, ma la pagina espone solo stato + refresh.
- **Nessuna history di eventi persistita.** `refresh-tracking` ritorna gli `events` ma non li salva in una timeline (si perde lo storico tra un refresh e l'altro).

---

## 3. Zone & Tariffe — verifica + come si fa "come le grandi piattaforme"

### Come funziona oggi (e cosa è rotto)
- Tabella `shipping_zones` (`nome`, `paesi`, `metodo`, `prezzo`, `spedizione_gratuita_da`). CRUD completo.
- **Impatta davvero il checkout**: `POST /api/orders` cerca una zona con
  ```sql
  SELECT prezzo, spedizione_gratuita_da FROM shipping_zones
  WHERE paesi LIKE ? ORDER BY id LIMIT 1   -- ? = '%' + paese + '%'
  ```
  e la passa a `resolveShipping(method, goodsTotal, zone)`, che **sovrascrive il prezzo standard e la soglia gratis** quando una zona corrisponde. Tabella vuota → default built-in (standard €5,90, gratis ≥ €100, express €8,90, ritiro €0).

**🐞 Bug critico — il matching per paese non funziona come progettato:**
1. **Formato paese incoerente.** L'ordine usa `paese` col **nome esteso "Italia"** (default), e il match è `paesi LIKE '%Italia%'`. Ma il form admin chiede **codici ISO** (`IT, FR, DE`). Una zona salvata come "IT, FR, DE" **non corrisponderà mai** a un ordine "Italia" → la zona viene ignorata silenziosamente e valgono i built-in. Funziona solo se l'admin scrive letteralmente una stringa che contiene "Italia".
2. **`metodo` ignorato nel match.** Si prende la prima zona per `id` a prescindere dal metodo, e `resolveShipping` applica la zona **solo allo standard**. Una zona "express" non fa nulla; due zone per lo stesso paese → vince l'`id` più basso, arbitrariamente.
3. **Solo `prezzo` + `spedizione_gratuita_da`, solo standard.** Nessun override express, nessuna logica per peso/fasce.
4. **`LIKE '%..%'` è pericoloso** (collisioni: "AUSTRIA" contiene "US", ecc.). Il match per paese va fatto su **lista di codici esatti**, non per sottostringa.

### Come lo fanno Shopify e WooCommerce (ricerca)
- **Shopify**: una *zona* è un gruppo di paesi/regioni; ogni zona ha *tariffe* **flat**, **price-based** (fasce sul valore ordine) o **weight-based** (fasce sul peso); la spedizione gratis è semplicemente una fascia a €0; tariffe **carrier-calculated** in tempo reale via API.
- **WooCommerce**: *zone* valutate dall'alto verso il basso per regione/paese/CAP (**prima zona che matcha vince**); ogni zona contiene **più metodi** (Flat rate, Free shipping con condizione min-importo/coupon, Local pickup); le *shipping class* permettono tariffe per prodotto.
- **Modello comune**: **Zona (match geografico ordinato, first-match-wins) → Metodi (flat / gratis-sopra-soglia / a fasce di peso / carrier-calculated / ritiro) → (opz.) classi di spedizione**, con una zona catch-all "Resto del mondo" e match per **codice paese esatto**.

Il modello MEMI è un sottoinsieme semplificato (un prezzo + una soglia per zona, solo standard) **con matching bacato**. Il piano (§5) lo allinea al modello zona→metodi.

Fonti: Shopify Help Center — [Setting up shipping zones and rates](https://help.shopify.com/en/manual/fulfillment/setup/shipping-rates/setting-up-shipping-rates); WooCommerce — [Setting up Shipping Zones](https://woocommerce.com/document/setting-up-shipping-zones/), [Core Shipping Options](https://woocommerce.com/documentation/woocommerce/shipping/core-shipping-options/).

---

## 4. Punti di ritiro — reso migliore + "ben implementato"

### Fatto in questa sessione (admin, solo frontend — verificato live)
Pagina `MEMI-Admin/src/pages/pickup.tsx` riscritta: avatar/icona sede, **link "Apri in Google Maps"** dall'indirizzo, corriere come **badge**, orari con icona, **toggle attivo/disattivo inline** (senza aprire il form), conteggio "X punti · Y attivi al checkout" nel sottotitolo, empty-state e form migliorati (placeholder/help). Testato sullo stack reale: create/list/toggle/delete OK.

### Il vero gap ("ben implementato") — da fare nel piano
Il checkout dello storefront (`Memi Abbigliamento/checkout.html`) ha **un'unica opzione "Ritiro in negozio" hardcoded** ("Via Mazzini 8, Milano") che **non legge `pickup_points`**. Quindi:
- L'admin può inserire punti di ritiro **ma il cliente non può sceglierli**.
- Il punto scelto **non viene salvato sull'ordine**.
- **Non esiste un endpoint pubblico** per i punti attivi (`GET /shipping/pickup` è admin-only).

→ Oggi la pagina è **data-entry senza effetto lato cliente**. Collegarla richiede: endpoint pubblico (punti attivi) + UI storefront per elencare/selezionare un punto quando `metodo=ritiro` + colonna ordine per persistere il punto (+ mostrarlo nel dettaglio ordine admin e nell'email). Tocca storefront + flusso ordine → è una modifica **da testare** (vedi §5, Fase 3), non un drive-by.

---

## 5. Piano di produzione — passi concreti

Ordine per **valore/rischio**. Nota trasversale: **il totale del checkout è calcolato in due punti che DEVONO coincidere** (`checkout.html` lato client e `POST /api/orders` lato server, sez. "Gotchas" del CLAUDE.md). Ogni modifica ai prezzi va fatta su **entrambi** i lati e verificata con `bash verify/run.sh` (sez. 7c).

### ✅ Fase 0 — già fatto in questa sessione
- Report: grafico "Fatturato mensile" reale (assi €, griglia, 12 mesi zero-fill, tooltip hover/click, ordini) + "Ordini per stato" a barre + mini-barre nelle categorie.
- Report: pulsante unico → **dropdown "Stampa" / "Scarica PDF"** (PDF vero via jsPDF).
- Punti di ritiro: pagina admin arricchita (mappa, badge, toggle inline, conteggi).

### ✅ Fase 1 — Correzioni a basso rischio (fatto 2026-07-19)
1. **Guardia sull'eliminazione corriere.** `DELETE /shipping/couriers/:code` ora conta i riferimenti in `shipments`+`orders` e risponde **409** se il corriere è in uso. Frontend `couriers.tsx` mostra l'errore (il per-riga usa una chiamata diretta con try/catch, il bulk conta i falliti — il `useDeleteMany` condiviso con `allSettled` mascherava l'errore). *SQL verificata read-only sul DB live (brt = 6 riferimenti → bloccherebbe).*
2. **Validazione `tracking_url_template`.** `validTrackingTemplate()` in `shipping.js` (POST+PUT) rifiuta con 400 se non è http(s) URL; il form `couriers.tsx` valida lato client e avvisa se manca `{tracking}`. *Validator unit-testato; colonna rinominata "Costo interno" verificata live.*
3. **Email "consegnato" coerente.** `PUT /shipping/shipments/:id` ora chiama `sendOrderStatusUpdate` quando lo stato passa a `consegnato` dal menu manuale (parità col percorso refresh; no-op senza SMTP).
4. **Chiarito `couriers.rate`** in UI: etichetta "Costo indicativo €" + help ("il prezzo al checkout è definito in Zone & Tariffe, non qui"); colonna lista/export "Costo interno".

> **Nota deploy**: i punti 1–3 sono modifiche backend (`routes/shipping.js`); il backend gira dall'immagine Docker (`CMD node src/server.js`, nessun bind-mount), quindi vanno **live al prossimo `docker compose up --build`**. Logica verificata offline (syntax `node --check`, validator unit-test, guard-SQL sul DB live); l'e2e del 409 richiede il redeploy. Punti 2 (client) e 4 sono già live via Vite.

### ✅ Fase 2 — Zone & Tariffe: matching corretto (fatto 2026-07-19 — decisione utente: "attiva le zone")

Trovato un **bug live**: le zone Italia usano il nome "Italia" (quindi il match `LIKE '%Italia%'` le pescava) con soglia gratis **€79**, mentre il client era cablato a **€100** → gli ordini carta italiani con merce €79–99,99 venivano **rifiutati (402)**. Le zone UE (codici ISO) non venivano mai pescate → tariffe UE ignorate.

Implementato (client + server ora concordano su ogni caso):
1. **Match paese esatto (codice ISO *o* nome), non più substring.** Nuove `matchZone()` + `resolveShipping()` generalizzata in `shipping-rates.js`; `orders.js` carica tutte le zone e usa `matchZone(zones, paese, metodo)`. Il codice ISO è derivato dal nome via mappa `COUNTRY_CODES` (nessuna modifica al payload/schema Zod).
2. **`metodo` onorato** (una zona express prezza l'express; catch-all "Resto del mondo" solo per paesi non coperti da zone specifiche; vince l'id più basso).
3. **Client zone-aware**: `checkout.html` fa fetch di `/api/shipping/zones` al load, **rispecchia** `matchZone`/`resolveShippingCost` (blocco marcato `==SHIPPING-CORE-START/END==`), ricalcola al cambio paese, e mostra il prezzo express dinamico.
4. **Form admin** (`shipping-zones.tsx`): help su codici ISO/nomi, catch-all, first-match-wins, e regola del `metodo`.
5. **Verifica**: `verify/shipping-parity.cjs` riscritto per estrarre il core del client e diffarlo col server su **zone × paesi × metodi × merce** (523 check, tutte le soglie) → `bash verify/run.sh` **verde**. Testato live (checkout servito nel container): fetch zone OK, `shippingFor` restituisce IT std €5,90 / IT express €12,90 / DE std €14,90 / NL std €17,90, label aggiornate al cambio paese, zero errori console.

**Matrice ora attiva** (5 paesi del selettore): IT std €5,90 (gratis ≥€79) · IT express €12,90 · DE/FR/ES std €14,90 (gratis ≥€149) · NL std €17,90 (gratis ≥€179) · express UE €8,90 (built-in) · ritiro €0.

> **⚠️ Da decidere (copy)**: la zona "Italia - Standard" rende gratis a **€79**, ma la copy marketing (~35 pagine, drawer) dice "gratis da **€100**". Non è un bug d'ordine (il cliente paga meno, non di più) ma è incoerente. Opzioni: (a) portare la soglia della zona a €100, o (b) aggiornare la copy a €79. **Zone "Isole" (Sicilia/Sardegna)** e **"Mondo"** restano di fatto inerti per i 5 paesi del selettore (le regioni non sono paesi; tutti e 5 hanno una zona specifica) — richiederebbero match per provincia / più paesi di destinazione.

> **Nota deploy**: backend (`shipping-rates.js`, `orders.js`) live al prossimo `docker compose up --build`; storefront (`checkout.html`) idem. Prima del go-live: **un ordine carta reale** IT standard nella fascia €79–99,99 e uno UE, per confermare l'assenza di 402.

### ✅ Fase 3 — Punti di ritiro collegati al checkout (fatto 2026-07-19)
1. **Endpoint pubblico** `GET /api/shipping/pickup-points` (solo `attivo=1`, colonne pubbliche) in `shipping.js`.
2. **UI storefront** (`checkout.html`): scegliendo "Ritiro" appare un selettore dei punti attivi (nome + indirizzo + orari); il punto scelto viene inviato come `pickup_point_id`. Se non ci sono punti configurati, si comporta come prima (ritiro generico). L'indirizzo hardcoded "Via Mazzini 8" è stato rimosso.
3. **Persistenza ordine**: colonna additiva `orders.pickup_point_id` (via `migrations.js`); `pickup_point_id` aggiunto a `createOrderSchema` (altrimenti Zod lo scarta) e salvato in `POST /orders` (solo se `ritiro`); il dettaglio ordine admin (`GET /orders/admin/:id`) fa il join e ritorna `pickup_point`; il dialog ordine React mostra un banner "Ritiro in negozio: …".
4. **Verifica live** (stack locale, backend riavviato — migrazione applicata a boot: `+ column orders.pickup_point_id`): endpoint pubblico ritorna solo i punti attivi; il selettore storefront carica 2 punti, appare su "Ritiro", il payload porta `pickup_point_id`; il dettaglio admin ritorna il `pickup_point` completo. `bash verify/run.sh` verde.

**Follow-up opzionali**: obbligare la selezione lato UI (oggi il primo punto è preselezionato); arricchire `pickup_points` con `citta`/`cap`/`telefono`/`lat`/`lng`; includere il punto di ritiro nell'email di conferma; dare agli ordini `ritiro` un flusso dedicato nel dialog (oggi mostra "assegna corriere", non pertinente).

### ✅ Fase 4 — Tracking multi-corriere (fatto 2026-07-20)
1. **Aggregatore generico** (`fetchAggregator`, AfterShip-style) in `courier-tracking.js`: UNA chiave copre tutti i corrieri (mappa `code→carrier slug`), quindi "Aggiorna" funziona per GLS/DHL/Poste/SDA e non solo BRT. Config-gated (`TRACKING_AGGREGATOR_KEY`/`AFTERSHIP_API_KEY`); senza chiave → `{configured:false}` e si degrada allo stato manuale. Un adapter dedicato (BRT) ha precedenza se ha le credenziali; SIMULATE resta per demo offline.
2. **Timeline eventi persistita**: tabella `shipment_events` (migrazione additiva, dedup su `tracking+label+ora`); `persistTrackingEvents()` salva gli eventi ad ogni refresh/webhook (INSERT IGNORE). Il dettaglio ordine admin e il tracking guest (`GET /orders/track`) ora ritornano `tracking_events`; il dialog ordine React mostra la timeline (storico all'apertura, eventi freschi dopo "Aggiorna").
3. **Webhook** `POST /api/shipping/tracking/webhook` (`routes/tracking-webhook.js`, montato in `server.js` con `express.raw` prima di `express.json`): config-gated (`TRACKING_WEBHOOK_SECRET` assente → 503), verifica HMAC-SHA256 del body grezzo (mismatch → 401), poi aggiorna spedizione+ordine (promozione a consegnato + email) e persiste gli eventi. Aggiorna lo stato senza polling.
4. **Copy storefront** allineata: "Tracciata con BRT / GLS" → "Tracciata (BRT, GLS, DHL, Poste…)".

> **Verifica**: offline completa — `node --check` su tutti i file; unit test (mapping stati aggregatore, config-gating, fallback `fetchTrackingStatus`); admin `tsc` + build; DDL `shipment_events` valida (tabella creata); dedup provato a livello SQL (INSERT IGNORE → 2 non 3). **L'integrazione HTTP end-to-end (refresh→persist sul server in esecuzione, webhook 503/401/200, timeline live nel dialog) NON è stata testata live**: il daemon Docker era degradato (port-mapping host↕container giù, `restart`/`exec node` in timeout). Da eseguire quando Docker si riprende / al prossimo deploy. Rischio deploy basso: aggregatore e webhook sono **inerti senza chiave/segreto** (comportamento prod invariato finché non configurati); la persistenza eventi è additiva/best-effort.

### ✅ Fase 5 — Rifiniture spedizioni (fatto 2026-07-20 — build-verified)
- **Dialog ordine per il ritiro** (`order-tracking-dialog.tsx`): un ordine con punto di ritiro non mostra più il form "assegna corriere/tracking" (senza senso per il ritiro) ma una scheda "Ritiro in negozio" con il punto scelto e il pulsante **"Segna ritirato"** (→ consegnato). Header/descrizione adattati.
- **ETA modificabile** nella pagina Spedizioni in corso (`shipments.tsx`): la colonna ETA è ora un date-picker inline che salva via `PUT /shipping/shipments/:id` (l'API accettava già `eta`, mancava la UI).
- **Audit** su `DELETE` corrieri/zone/punti (`shipping.js`, `logAdminAction`, best-effort).

> **Verifica**: frontend `tsc` + build verdi; backend `node --check` + export `logAdminAction` confermato. **Non testato live** (Docker ancora degradato: host↔container giù, dev server :5174 irraggiungibile) — da smoke-testare col resto quando Docker si riprende.

**Follow-up ancora aperti** (non fatti): audit su create/update di zone/punti; corriere di default + mappatura metodo→corriere per auto-assegnazione; punto di ritiro nell'email di conferma; pulsante "Crea spedizione" dalla pagina Spedizioni (oggi le spedizioni nascono dall'azione "Spedisci" sull'ordine); obbligare la selezione esplicita del punto di ritiro (oggi il primo è preselezionato).

---

## 6. Rischi & guardrail
- **Prezzi in due punti**: qualsiasi cosa in Fase 2/3 che cambi il costo di spedizione va replicata client+server e verificata (`verify/run.sh` 7c) + ordine carta reale, altrimenti si rompe **ogni** pagamento con 402 "Importo non corrisponde".
- **Sessioni concorrenti**: altre sessioni Claude lavorano sullo stesso repo — non riavviare lo stack condiviso, non committare in blocco.
- **Migrazioni additive** (nuove colonne) sono sicure e idempotenti via `migrations.js`; evitare drop/rename senza migrazione dedicata.
- **Integrazioni config-gated**: mantenere il pattern "assente → no-op/503 gentile" per non far crashare demo/locale senza credenziali.
