# Dati clienti (`/customers`) — point 12

**Nav:** Clienti → Tutti i clienti (`nav.ts:70`) · **Files:** `MEMI-Admin/src/pages/customers.tsx` (list 58-160, form 163-215) · **API client:** `api.customers.*` (`lib/api.ts:214-218`) · **Backend:** `MEMI-Backend/src/routes/customers.js` (mounted `/api/admin/customers`, `server.js:282`, `requirePermission('customers')`)

**Status:** REAL ✓ (functional CRUD) · **Priority:** P2

> **✅ Update 2026-07-18 — FIXED & verified.** Added a read-only **customer profile view**
> (`/customers/:id` → `MEMI-Admin/src/pages/customer-scheda.tsx`; "Scheda" action on each row) that
> surfaces the rich detail the endpoint already returns — order history, loyalty points, saved
> addresses, newsletter status, wishlist/sizes — which the edit form used to discard. **Email is now
> editable in admin** (added to the edit form + the backend `PUT` allow-list with `ER_DUP_ENTRY`→409),
> closing the create-only asymmetry. Verified live: profile shows order #10255 + 261 points; email
> edit round-trips 200. **Remaining:** editing the multi-address book (`customer_addresses`) from admin
> is still read-only here.

---

## What it is (current state)

A working, DB-backed customer manager in two views:

- **List** (`CustomersPage`, `customers.tsx:58`): a `DataTable` of customers — Cliente (avatar + name + email + a client-side "VIP" badge when `total_spent > 300`, `customers.tsx:74`), Città, Ordini, Totale speso, Ultimo accesso, per-row **Modifica**, header **Nuovo cliente**, bulk **Elimina** with a confirm dialog, and CSV/PDF export. Server-side debounced search.
- **Form** (`CustomerFormPage`, `customers.tsx:163`): full-page create/edit. **Create** collects nome, cognome, email, telefono, optional password, indirizzo, città, cap, paese (`CREATE_FIELDS`, `customers.tsx:46-56`). **Edit** collects nome, cognome, telefono, indirizzo, città, cap, paese (`ADDRESS_FIELDS`, `customers.tsx:36-44`) — **note: no email field on edit.**

**Data source — REAL.** List → `useCustomers` → `api.customers.list({limit,offset,q})` → `GET /api/admin/customers` → `SELECT … FROM customers` (`customers.js:18-48`). Edit detail → `api.customers.get(id)` → `GET /api/admin/customers/:id` (`customers.js:51-94`), which returns the customer row **plus** order history (`orders`), saved addresses (`customer_addresses`), and newsletter status (`newsletter_subscribers`).

**Functional — yes.** Create → `POST /api/admin/customers` (`customers.js:134`); update → `PUT /api/admin/customers/:id` (`customers.js:97`, allow-list `['nome','cognome','telefono','indirizzo','citta','cap','paese']` at line 98); delete → `DELETE …/:id` (`customers.js:122`). Update and delete are audit-logged.

## What it should be (purpose)

The single source of truth for customer records that the storefront also reads/writes — a place to look up a customer, see their **full profile** (orders, loyalty points, saved addresses, newsletter, wishlist, sizes), and correct their contact/shipping details, staying in sync with the customer's own Area Personale.

**Connection to Area Personale (the point-12 question): confirmed and bidirectional for the core fields.**
The storefront profile form (`Memi Abbigliamento/account-core.js:1152`) calls `PUT /api/auth/me` (`auth.js`), and both that and the admin `PUT /api/admin/customers/:id` update **the same `customers` row by `id`**. An admin edit to nome/cognome/telefono/indirizzo is immediately visible in the customer's account, and vice-versa.

## What's missing

1. **No read-only customer profile view.** The detail endpoint returns orders, points, addresses, newsletter, wishlist, sizes, and preferences — but the form maps only 7 scalar fields (`customers.tsx:174-183`) and **discards the rest**. There is no `/customers/:id` scheda; the eye/detail pattern used by orders isn't here.
2. **Email is not editable in admin after creation** — absent from `ADDRESS_FIELDS` and from the backend allow-list (`customers.js:98`). The storefront *can* change email (`auth.js`), creating an asymmetry.
3. **The multi-address book is not editable in admin.** Area Personale addresses live in `customer_addresses` (`GET/PUT /api/auth/addresses`). Admin only writes the flat `customers.indirizzo/citta/cap/paese` mirror, so an admin address change does **not** appear in the customer's saved-addresses list (it does show in checkout pre-fill).
4. Admin cannot view/adjust newsletter status, loyalty points, birthday, lang, sizes, or preferences from this page (all exist in the DB and are set by the storefront).

## Fix outline

- **Add a customer detail page** `/customers/:id` (`ProductSchedaPage`-style, reusing the existing detail fetch): render orders, points ledger link, saved addresses, newsletter status, wishlist. **Effort: M.** *(Biggest value — turns a thin edit form into a real CRM record.)*
- **Allow email edit** — add `email` to `ADDRESS_FIELDS` and to the backend allow-list, with a uniqueness check (mirror the `ER_DUP_ENTRY` → 409 handling already in `POST`). **Effort: S.**
- **Edit the address book** — add a `customer_addresses` editor to the detail page reusing `/api/auth/addresses` shapes (or an admin equivalent). **Effort: M.**
- **Surface newsletter/loyalty** — read-only badges + quick links to `/loyalty` and newsletter toggle. **Effort: S.**

**Priority rationale — P2:** the page works and the storefront connection is genuine, so nothing is broken; but the missing profile view and email/address asymmetries are real day-to-day limitations for anyone doing customer service.
