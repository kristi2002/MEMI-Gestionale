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
| `ADMIN_EMAIL` | es. `admin@memiabbigliamento.it` | Sovrascrive il default seeded |
| `ADMIN_PASSWORD` | password forte | Min 12 char |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Live in prod, `sk_test_...` in staging |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Idem |
| `SMTP_HOST` | `smtp.gmail.com` o simile | |
| `SMTP_PORT` | `587` o `465` | |
| `SMTP_SECURE` | `false` (587) / `true` (465) | |
| `SMTP_USER` | email mittente | |
| `SMTP_PASS` | password app specifica | |
| `SMTP_FROM` | `"Memi Abbigliamento <info@memiabbigliamento.it>"` | |
| `ALLOWED_ORIGINS` | `https://memiabbigliamento.it,https://admin.memiabbigliamento.it` | |
| `FRONTEND_URL` | `https://memiabbigliamento.it` | Usato nei link email |
| `NODE_ENV` | `production` | Abilita logging errori red |
| `MAX_UPLOAD_MB` | `8` (default) | Limite upload immagini |

---

## 2. DNS Setup

Punta al Hetzner server IP:

| Record | Tipo | Valore |
|---|---|---|
| `memiabbigliamento.it` | A | `<server-ip>` |
| `www.memiabbigliamento.it` | A | `<server-ip>` |
| `api.memiabbigliamento.it` | A | `<server-ip>` |
| `admin.memiabbigliamento.it` | A | `<server-ip>` |

---

## 3. Coolify Setup

1. **New Resource → Docker Compose** → punta al repository GitHub
2. **Compose file path:** `docker-compose.yml`
3. **Environment Variables:** inserisci tutti i secrets dalla sezione 1
4. **Domains per servizio:**
   - `backend` → `api.memiabbigliamento.it`
   - `ecommerce` → `memiabbigliamento.it`, `www.memiabbigliamento.it`
   - `admin` → `admin.memiabbigliamento.it`
5. **Deploy** → Coolify builda le immagini Docker + provisiona TLS automaticamente

---

## 4. Primo Boot — Verifica

```bash
# Health check
curl https://api.memiabbigliamento.it/health
# → {"status":"ok","ts":"..."}

# Prodotti
curl https://api.memiabbigliamento.it/api/products | head -c 500
# → JSON array con 23 prodotti

# Login admin (solo per verifica — poi cambia credenziali)
curl -X POST https://api.memiabbigliamento.it/api/admin/auth/login \
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
- [ ] `FRONTEND_URL` = `https://memiabbigliamento.it`
- [ ] `NODE_ENV=production`
- [ ] Log boot: tutti e 3 i ✅, nessun 🔴

### Storefront
- [ ] `app.js?v=13` referenziato uniformemente in tutti gli HTML
- [ ] `api-client.js?v=3` uniforme
- [ ] `<meta name="memi-api" content="/api">` presente in tutte le pagine (o nginx proxia `/api`)
- [ ] Checkout funzionante con carta Stripe live (test con carta reale a basso importo)
- [ ] Email conferma ordine ricevuta
- [ ] `robots.txt` + `sitemap.xml` accessibili
- [ ] `sitemap.xml` sottomessa in Google Search Console

### Admin
- [ ] Login con le credenziali definite in env
- [ ] Dashboard mostra dati reali (dopo aver creato almeno un ordine di test)
- [ ] Caricamento immagine prodotto funzionante
- [ ] `app.js?v=23` e `admin-api.js?v=15` referenziati in `dashboard.html`

### Volumi Docker
- [ ] `mysql_data` volume: persiste il DB tra i restart
- [ ] `uploads_data` volume: persiste le immagini prodotto tra i restart
- [ ] **IMPORTANTE:** non eseguire mai `docker compose down -v` in produzione

---

## 6. Backup

```bash
# Aggiungi al crontab del server Hetzner:

# Backup MySQL giornaliero alle 3:00
0 3 * * * docker exec $(docker ps -qf name=mysql) \
  mysqldump -u root -p${MYSQL_ROOT_PASSWORD} memi_db \
  | gzip > /backups/memi_db_$(date +%Y%m%d).sql.gz

# Backup immagini settimanale
0 4 * * 0 docker run --rm \
  -v memi_uploads_data:/data \
  -v /backups:/backup \
  alpine tar czf /backup/uploads_$(date +%Y%m%d).tgz -C /data .

# Cleanup: mantieni 30 giorni
0 5 * * * find /backups -name "*.sql.gz" -mtime +30 -delete
0 5 * * * find /backups -name "*.tgz" -mtime +30 -delete
```

---

## 7. Monitoraggio

```bash
# Health check da cron (opzionale — per alerting via email)
*/5 * * * * curl -sf https://api.memiabbigliamento.it/health || \
  echo "MEMI API down $(date)" | mail -s "ALERT: MEMI API" admin@memiabbigliamento.it
```

Alternativa consigliata: **UptimeRobot** (gratuito) o **Better Uptime** — monitora `/health` ogni 5 minuti con notifica SMS/email.

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

1. **Google Search Console:** aggiungi proprietà per `memiabbigliamento.it`
2. **Sitemap:** sottometti `https://memiabbigliamento.it/sitemap.xml`
3. **Robots.txt:** verifica `https://memiabbigliamento.it/robots.txt` accessibile
4. **Core Web Vitals:** testa con PageSpeed Insights
5. **Structured data:** testa con Rich Results Test di Google
