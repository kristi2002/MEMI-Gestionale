# MEMI — Produzione Readiness Checklist
*Hetzner / Coolify — Luglio 2026*

Documento di riferimento per il deploy in produzione. Completa ogni sezione nell'ordine indicato.

---

## 1. Pre-Deploy: Secrets & Environment

**Tutti obbligatori — la mancanza di JWT_SECRET / JWT_ADMIN_SECRET causa boot fail.**

```bash
# Genera secrets sicuri
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

| Variabile | Valore atteso | Note |
|---|---|---|
| `JWT_SECRET` | 64-char hex | Diverso da JWT_ADMIN_SECRET |
| `JWT_ADMIN_SECRET` | 64-char hex | Diverso da JWT_SECRET |
| `DB_USER` | `memi_user` | |
| `DB_PASSWORD` | password forte | |
| `DB_NAME` | `memi_db` | |
| `MYSQL_ROOT_PASSWORD` | password forte | Solo MySQL |
| `ADMIN_EMAIL` | es. `admin@memi.testdemo.it` | Sovrascrive il default seeded |
| `ADMIN_PASSWORD` | password forte | Min 12 char |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Live in prod, `sk_test_...` in staging |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Idem |
| `SMTP_HOST` | `smtp.gmail.com` o simile | |
| `SMTP_PORT` | `587` o `465` | |
| `SMTP_SECURE` | `false` (587) / `true` (465) | |
| `SMTP_USER` | email mittente | |
| `SMTP_PASS` | password app specifica | |
| `SMTP_FROM` | `"Memi Abbigliamento <info@memi.testdemo.it>"` | |
| `ALLOWED_ORIGINS` | `https://memi.testdemo.it,https://admin.memi.testdemo.it` | |
| `FRONTEND_URL` | `https://memi.testdemo.it` | Usato nei link email |
| `NODE_ENV` | `production` | Abilita logging errori red |
| `MAX_UPLOAD_MB` | `8` (default) | Limite upload immagini |

---

## 2. DNS Setup

Punta al Hetzner server IP:

| Record | Tipo | Valore |
|---|---|---|
| `memi.testdemo.it` | A | `<server-ip>` |
| `www.memi.testdemo.it` | A | `<server-ip>` |
| `api.memi.testdemo.it` | A | `<server-ip>` |
| `admin.memi.testdemo.it` | A | `<server-ip>` |

---

## 3. Coolify Setup

1. **New Resource → Docker Compose** → punta al repository GitHub
2. **Compose file path:** `docker-compose.yml`
3. **Environment Variables:** inserisci tutti i secrets dalla sezione 1
4. **Domains per servizio:**
   - `backend` → `api.memi.testdemo.it`
   - `ecommerce` → `memi.testdemo.it`, `www.memi.testdemo.it`
   - `admin` → `admin.memi.testdemo.it`
5. **Deploy** → Coolify builda le immagini Docker + provisiona TLS automaticamente

---

## 4. Primo Boot — Verifica

```bash
# Health check
curl https://api.memi.testdemo.it/health
# → {"status":"ok","ts":"..."}

# Prodotti
curl https://api.memi.testdemo.it/api/products | head -c 500
# → JSON array con 23 prodotti

# Login admin (solo per verifica — poi cambia credenziali)
curl -X POST https://api.memi.testdemo.it/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<ADMIN_EMAIL>","password":"<ADMIN_PASSWORD>"}'
# → {"token":"...","admin":{...}}
```

**Controlla i log backend:**
```bash
docker compose logs backend | grep -E "(schema ensured|Migrations|API running|SECURITY)"
```

Deve apparire:
- ✅ `Core schema ensured`
- ✅ `Migrations applied`
- ✅ `MEMI API running on port 3000`
- ✅ `Admin account bootstrapped from env: <email>`
- ❌ NESSUN `🔴 SECURITY: Default admin credentials`

---

## 5. Checklist Go-Live

### Backend
- [ ] `JWT_SECRET` e `JWT_ADMIN_SECRET` impostati e diversi tra loro
- [ ] `DB_PASSWORD` e `MYSQL_ROOT_PASSWORD` forti (min 20 char)
- [ ] `ADMIN_EMAIL` + `ADMIN_PASSWORD` impostati → nessun warning 🔴 nei log
- [ ] `STRIPE_SECRET_KEY` live (`sk_live_...`) + `STRIPE_PUBLISHABLE_KEY` (`pk_live_...`)
- [ ] `SMTP_*` configurati → email ordini funzionanti
- [ ] `ALLOWED_ORIGINS` = domini produzione
- [ ] `FRONTEND_URL` = `https://memi.testdemo.it`
- [ ] `NODE_ENV=production`
- [ ] Log boot: tutti e 3 i ✅, nessun 🔴

### Storefront
- [ ] Cache-bust automatico: `scripts/cache-bust.js` gira nel build Docker e riscrive `?v=` in hash
      di contenuto — **non** serve bumpare `?v=N` a mano; i valori sorgente devono solo essere
      coerenti (`bash verify/run.sh` §2 lo verifica). nginx serve HTML `no-cache`.
- [ ] La chiave pubblica Stripe è disponibile: `checkout.html` la legge da `GET /api/payments/config`
      (quindi `STRIPE_PUBLISHABLE_KEY` **deve** essere impostata sul backend, altrimenti la carta non parte)
- [ ] Checkout funzionante con carta Stripe live (test con carta reale a basso importo)
- [ ] Email conferma ordine ricevuta
- [ ] `robots.txt` + `sitemap.xml` accessibili
- [ ] `sitemap.xml` sottomessa in Google Search Console

### Admin
- [ ] Login con le credenziali definite in env
- [ ] Dashboard mostra dati reali (dopo aver creato almeno un ordine di test)
- [ ] Caricamento immagine prodotto funzionante
- [ ] Cache-bust admin automatico via `MEMI/scripts/cache-bust.js` nel build (nessun bump `?v=N` manuale)

### Volumi Docker
- [ ] `mysql_data` volume: persiste il DB tra i restart
- [ ] `uploads_data` volume: persiste le immagini prodotto tra i restart
- [ ] **IMPORTANTE:** non eseguire mai `docker compose down -v` in produzione

---

## 6. Backup

**Usa gli script pronti in `deploy/`** — scoprono container/volumi tramite la **label** del servizio
Docker Compose (`com.docker.compose.service=...`), quindi funzionano a prescindere dal prefisso che
Compose deriva dal nome cartella. Non hardcodare mai il nome del volume (es. `memi_uploads_data`): il
prefisso reale dipende dal progetto.

```bash
# Crontab del server Hetzner (vedi header di deploy/backup.sh per tutte le env):
0 3 * * *  MYSQL_ROOT_PASSWORD='...' BACKUP_DIR=/backups /path/to/deploy/backup.sh db      >> /var/log/memi-backup.log 2>&1
0 4 * * 0  BACKUP_DIR=/backups /path/to/deploy/backup.sh uploads                            >> /var/log/memi-backup.log 2>&1
# backup.sh gestisce già dump MySQL --single-transaction, tar del volume uploads, e rotazione (RETENTION_DAYS, default 30).
```

Ripristino testato: **`deploy/restore.sh db|uploads <archivio>`** (distruttivo, chiede conferma salvo `FORCE=1`).
Sincronizza gli archivi off-box (Hetzner Storage Box / S3) — un backup sullo stesso disco non è un backup.

---

## 7. Monitoraggio

**Usa `deploy/healthcheck-monitor.sh`** — fa il polling di `/health` (che verifica anche il DB),
allerta una sola volta quando va down + una nota di recovery (niente spam), via email (`mail`) e/o webhook:

```bash
# Ogni 5 minuti:
*/5 * * * * HEALTH_URL=https://api.memi.testdemo.it/health \
            ALERT_EMAIL=admin@memi.testdemo.it /path/to/deploy/healthcheck-monitor.sh >> /var/log/memi-health.log 2>&1
```

Alternativa/complemento: **UptimeRobot** (gratuito) o **Better Uptime** — monitora `/health` ogni 5 minuti con notifica SMS/email.

---

## 8. Auto-Deploy

In Coolify → Settings → Webhooks → abilita "Deploy on push to main".
Ogni `git push origin main` triggera rebuild e redeploy automatico.

**Warning:** il rebuild ricrea i container ma i volumi `mysql_data` e `uploads_data` persistono.

---

## 9. Troubleshooting Rapido

| Sintomo | Causa più comune | Fix |
|---|---|---|
| Backend non parte | JWT_SECRET mancante | Impostare in Coolify env |
| 401 su login admin | Credenziali errate o token scaduto | Verificare ADMIN_EMAIL/PASSWORD in env |
| Dashboard revenue = 0 | Ordini non marcati `pagato` | Verificare Stripe config |
| CORS error nel browser | ALLOWED_ORIGINS mancante/errato | Aggiungere dominio |
| Email non arrivano | SMTP non configurato | Aggiungere SMTP_* vars |
| Immagini prodotto non mostrate | uploads_data volume non montato | Verificare docker-compose.yml |
| Checkout → "Servizio pagamenti non disponibile" | STRIPE_SECRET_KEY mancante | Aggiungere chiave Stripe |
| Lista endpoint → 500 "table missing" | Schema parziale | Riavviare backend: migrations auto-repair |
| Admin JS invariato dopo deploy | Cache immutable browser | Bumpa `?v=N` e hard-refresh |

---

## 10. Post-Deploy: SEO

1. **Google Search Console:** aggiungi proprietà per `memi.testdemo.it`
2. **Sitemap:** sottometti `https://memi.testdemo.it/sitemap.xml`
3. **Robots.txt:** verifica `https://memi.testdemo.it/robots.txt` accessibile
4. **Core Web Vitals:** testa con PageSpeed Insights
5. **Structured data:** testa con Rich Results Test di Google
