# MEMI — Guida per eseguire il progetto in locale

Questa guida spiega come avviare l'intero progetto MEMI (negozio online + pannello
gestionale + backend + database) sul tuo computer per testarlo.

Il progetto è composto da **4 servizi**:

| Servizio | Cos'è | Indirizzo locale |
|----------|-------|------------------|
| `mysql` | Database MySQL 8 | `localhost:3307` |
| `backend` | API Node.js/Express | `http://localhost:3000` |
| `ecommerce` | Negozio online (sito clienti) | `http://localhost:8080` |
| `admin` | Pannello gestionale | `http://localhost:8081` |

---

## ✅ Modo consigliato: con Docker (un solo comando)

Questo è di gran lunga il modo più semplice: non devi installare Node, MySQL o
configurare nulla a mano. Docker costruisce e avvia tutto da solo.

### 1. Installa Docker Desktop

- Windows / Mac: scarica **Docker Desktop** da <https://www.docker.com/products/docker-desktop/>
- Installalo, avvialo e aspetta che dica **"Engine running"**.

(Niente altro da installare — Node, MySQL ecc. girano dentro Docker.)

### 2. Estrai il progetto

Scompatta lo zip in una cartella, ad esempio `C:\MEMI` o `~/MEMI`.

### 3. Avvia tutto

Apri un terminale **dentro la cartella del progetto** (quella che contiene
`docker-compose.yml`) ed esegui:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

La prima volta ci mette qualche minuto (scarica le immagini e costruisce). Quando
vedi nei log righe come `MEMI API running on port 3000` e
`Core schema ensured`, è pronto.

> Lascia questo terminale aperto: chiuderlo ferma le app. Per fermarle premi
> `Ctrl + C`, oppure da un altro terminale: `docker compose down`.

### 4. Apri le app nel browser

- **Pannello gestionale (admin):** <http://localhost:8081>
- **Negozio online:** <http://localhost:8080>

### 5. Accedi al gestionale

Il database viene creato automaticamente al primo avvio, **già con un account
admin e dei prodotti di esempio**. Usa:

- **Email:** `admin@memi.it`
- **Password:** `memi2026admin`

Fatto 🎉 — puoi navigare ordini, prodotti, clienti, ecc.

---

## 🔁 Comandi utili (Docker)

```bash
# Avviare (in primo piano, vedi i log)
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build

# Avviare in background
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d

# Fermare
docker compose down

# Fermare E cancellare il database (riparti da zero, ricrea i dati di esempio)
docker compose down -v

# Vedere i log del backend
docker compose logs -f backend
```

> **Nota importante sul database:** i dati restano salvati in un volume Docker
> anche dopo `docker compose down`. Se vuoi azzerare tutto e ricreare i dati di
> esempio, usa `docker compose down -v` (la `-v` cancella il volume).

---

## 🛠️ Problemi comuni

**"port is already allocated" / porta occupata**
Hai già qualcosa che usa la porta 8080, 8081, 3000 o 3307. Chiudi quell'app,
oppure cambia il numero a sinistra dei due punti in `docker-compose.local.yml`
(es. `"9090:80"`) e usa quella porta nel browser.

**Il gestionale si apre ma è vuoto / errori 500**
Aspetta ~30 secondi al primo avvio: il backend parte solo quando MySQL è pronto.
Se persiste, guarda `docker compose logs backend`.

**Voglio ripartire pulito**
`docker compose down -v` e poi riavvia con il comando del punto 3.

**Login non funziona**
Assicurati di usare `admin@memi.it` / `memi2026admin`. Se avevi cambiato il
database, fai `docker compose down -v` per rigenerarlo.

---

## 💳 Pagamenti ed email (opzionale)

Per il test di base **non serve niente**. Le funzioni di pagamento (Stripe) e
invio email (SMTP) restano semplicemente disattivate finché non si configurano le
chiavi. Se le vuoi attivare, crea un file `.env` nella cartella del progetto (vedi
`MEMI-Backend/.env.example` come modello) con le tue chiavi `STRIPE_*` e `SMTP_*`.

---

## 🧰 Alternativa: avvio manuale (senza Docker, per sviluppatori)

Solo se preferisci non usare Docker. Più passaggi e devi installare i programmi.

**Ti servono:** Node.js 20+, MySQL 8 installato e in esecuzione.

1. **Crea il database e l'utente** in MySQL (da MySQL Workbench o riga di comando):
   ```sql
   CREATE DATABASE memi_db CHARACTER SET utf8mb4;
   CREATE USER 'memi_user'@'localhost' IDENTIFIED BY 'memi_pass';
   GRANT ALL PRIVILEGES ON memi_db.* TO 'memi_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

2. **Configura il backend.** Nella cartella `MEMI-Backend`, copia `.env.example`
   in `.env` e imposta almeno:
   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=memi_db
   DB_USER=memi_user
   DB_PASSWORD=memi_pass
   JWT_SECRET=una_stringa_lunga_a_caso
   JWT_ADMIN_SECRET=un_altra_stringa_lunga_a_caso
   NODE_ENV=development
   ```

3. **Installa e inizializza** (dentro `MEMI-Backend`):
   ```bash
   npm install
   npm run db:init      # crea le tabelle e i dati di esempio
   npm start            # avvia l'API su http://localhost:3000
   ```

4. **Servi i siti statici.** I siti `MEMI` (admin) e `Memi Abbigliamento` (shop)
   chiamano l'API su `/api`, quindi vanno serviti da qualcosa che inoltra `/api`
   al backend. Il modo più semplice resta Docker (che fa già da proxy). In manuale
   dovresti configurare un proxy locale (es. nginx) — per questo **consigliamo
   Docker** per evitare complicazioni.

> In breve: per il backend va benissimo il manuale; per far funzionare i due siti
> insieme al backend, Docker è molto più comodo.

---

## 📦 Cosa mandare al tuo amico

Manda **l'intera cartella del progetto** in uno zip. Includi tutto TRANNE le cose
generate/segrete (più leggero e sicuro):

**Da NON includere nello zip:**
- `node_modules/` (si rigenera da solo — è enorme)
- `.git/` (cronologia git, non serve per eseguire)
- qualsiasi file `.env` con password/chiavi vere (non condividere segreti)

**Da includere (tutto il resto):** `docker-compose.yml`,
`docker-compose.local.yml`, le cartelle `MEMI/`, `MEMI-Backend/`,
`Memi Abbigliamento/`, i `Dockerfile`, lo `schema.sql`, e questo `LOCAL-RUN.md`.

**Il tuo amico deve installare solo una cosa:** Docker Desktop. Nient'altro — non
deve procurarsi database, chiavi o file esterni per il test di base. I dati di
esempio e l'account admin vengono creati in automatico al primo avvio.

> Suggerimento: i segreti di produzione (password DB, JWT) **non** servono in
> locale — vengono usati dei valori di default sicuri per il test. Non mandare mai
> le chiavi reali di Stripe/SMTP o le password di produzione dentro lo zip.
