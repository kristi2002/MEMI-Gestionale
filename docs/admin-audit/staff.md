# Staff & Permessi (`/staff`) — point 25

**Nav:** Strumenti → Staff & Permessi (`nav.ts:131`, adminOnly) · **File:** `MEMI-Admin/src/pages/staff.tsx` (page 66-162, form 165-227) · **API client:** `api.staff.*` (`lib/api.ts:277-280`) · **Backend:** `MEMI-Backend/src/routes/staff.js` + `MEMI-Backend/src/permissions.js` + `middleware/auth.js` (mounted `/api/admin/staff`, `server.js:293`, `requirePermission('staff')`)

**Status:** REAL ✓ + genuine RBAC · **Priority:** P2

> **✅ Update 2026-07-18 — token/session revocation FIXED & verified.** `requireAdmin`
> (`middleware/auth.js`) now re-validates the JWT against the live `admin_users` row on every request:
> a **deleted** staff account is rejected immediately (verified: `200` → `401` on delete, was valid for
> 8h), and **role/permissions are refreshed from the DB** so a permission change also takes effect at
> once — no schema change, with a transient-DB-error fallback to the verified token so a blip can't lock
> admins out.
>
> **✅ Update 2026-07-19 — granular per-view permission editor FIXED & verified.** The staff form now
> has a full **checkbox matrix** over all 46 RBAC views (grouped like the sidebar, "solo admin" badges on
> Statistiche/Finanza/Sistema), replacing the 5-preset select. Two access modes: **"Amministratore —
> accesso completo"** (role=admin, permissions=null) and **"Permessi specifici"** with per-view toggles.
> Preset quick-fill buttons (Staff/Magazzino/Servizio clienti/Marketing) + **Tutto/Niente**; any manual
> toggle flips to a **"Personalizzato"** set. Backend needed **no change** — it already stored an
> arbitrary `permissions` array (validated by the `staffCreateSchema`/`staffUpdateSchema` Zod arrays).
> Two safety guards added: **Home is always granted** (an empty set would collapse to the full staff
> surface on the backend), and an admin **can't strip their own admin role** (lock-out prevention).
> Verified live end-to-end: created a member with `["dashboard","customers"]` → stored exactly →
> that account gets **200 on `/admin/customers`** but **403 on `/admin/discounts` and `/admin/staff`**;
> UI "Niente" leaves exactly 1 of 46 boxes checked (Home) and shows "Personalizzato". **Remaining:**
> last-login / active-session visibility, 2FA, and having the storefront **nav** hide sections a staff
> member lacks permission for (today the nav only hides `adminOnly` groups by role; granular denials are
> enforced by the API with a 403, not yet reflected in the sidebar).

---

## What it is (current state)

A staff/user manager with role-based permissions. The `DataTable` shows Membro (avatar + nome + email), Ruolo (Admin/Staff), **Permessi** (chips of the first 4 permission views + "+N", or "tutti (da ruolo)"), Creato il, per-row **Modifica**, header **Nuovo membro**, and a bulk delete that **excludes your own account** (`staff.tsx:145-158`). The form assigns a **permission profile** via a select — admin / staff / warehouse / customer_service / marketing — with a read-only "custom" option when the stored set matches no preset. Password required on create, optional on edit.

**Data source — REAL.** `useStaff` → `GET /api/admin/staff` → `SELECT id,email,nome,role,permissions,created_at FROM admin_users` (`staff.js:20-30`).

**Functional — full CRUD + real RBAC.** Create/update/delete all wired (`api.ts:277-280`; routes `App.tsx:73-74`). The form maps the chosen profile → `{role, permissions}` (`staff.tsx:208-224`). Backend enforces an extra `role==='admin'` gate on mutations, min-8-char bcrypt passwords, `ER_DUP_ENTRY`→409, a **self-delete guard**, and audit-logs staff.create/update/delete.

**The RBAC is the real thing:** `permissions.js` defines presets + `resolvePermissions(role, json)`; `middleware/auth.js requirePermission()` gates **every** admin mount in `server.js`; the permission set is signed into the JWT at login and re-resolved on `/me`, so UI and API share one model.

## What it should be (purpose)

Manage who can access the admin and what each person can do — create staff, assign a role/permission set, rotate passwords, revoke access — with least-privilege enforced server-side (which it is).

## What's missing

1. ~~**No granular per-view permission editor**~~ **DONE (2026-07-19)** — a full 46-view checkbox matrix now authors an arbitrary permission set (see the update note above); the "Personalizzato" set is fully editable, not display-only.
2. **No token/session revocation.** Because permissions live in an **8-hour JWT**, changing a member's profile — or even **deleting** the account — does **not** take effect until their current token expires or they re-login. A removed staffer keeps working access for up to 8h.
3. No last-login / active-session visibility, no 2FA, no forced logout.

## Fix outline

- **Granular editor** — a checkbox matrix over `STAFF_VIEWS` that writes the `permissions` JSON directly (backend already stores an arbitrary array). **Effort: M.**
- **Revocation** — add a token version/`token_valid_after` column checked in `requireAdmin`, bumped on permission change/delete → invalidates outstanding JWTs. **Effort: M** (security-important given delete currently lags).
- Last-login + "forza logout" + optional 2FA. **Effort: M–L.**

**Priority rationale — P2:** CRUD and enforcement are genuinely production-grade, but "deleting a staffer doesn't lock them out for 8 hours" is a real security gap worth prioritizing above the cosmetic ones.
