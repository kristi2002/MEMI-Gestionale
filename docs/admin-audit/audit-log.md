# Registro attività (`/audit-log`) — point 26

**Nav:** Strumenti → Registro attività (`nav.ts:132`, adminOnly) · **File:** `MEMI-Admin/src/pages/audit-log.tsx` (page 21-69) · **API client:** `api.auditLog.list()` (`lib/api.ts:283`) · **Backend:** `MEMI-Backend/src/routes/audit-log.js` (reader) + `MEMI-Backend/src/audit.js` (writer) (mounted `/api/admin/audit-log`, `server.js:300`, `requirePermission('audit-log')`)

**Status:** REAL ✓ (read-only by design) · **Priority:** P2

> **✅ Update 2026-07-18:** the write-coverage gap (#1) is now closed — supplier
> create/update/delete and PO update/delete call `logAdminAction` (`purchasing.js`).
> **Server-side pagination/filtering (#2) also FIXED & verified:** the endpoint now takes
> `offset` + returns an `X-Total-Count` header (with `action`/`entity_type` filters), and the page
> uses an infinite "carica altri" query (`useInfiniteQuery`), so entries beyond the first window are
> reachable. Verified live: total 229, distinct offset pages, `?action=` filter works. A full-payload
> detail view (#3) remains.

---

## What it is (current state)

A read-only audit trail. The `DataTable` (pageSize 50) shows Data, Admin (email or `#id`), Azione (badge), Entità (`type#id`), Dettagli (line-clamped JSON), with search across admin/action/entity and CSV/PDF export. No row actions, no create button — correct for an append-only log.

**Data source — REAL.** `useAuditLog` → `GET /api/admin/audit-log?limit=300` → `SELECT * FROM audit_log ORDER BY created_at DESC` (`audit-log.js:13-29`; supports an `entity_type` filter the UI doesn't use).

**Writer — REAL.** `audit.js logAdminAction()` inserts into `audit_log`; every call site chains `.catch(()=>{})` so a logging failure never breaks the underlying action. Confirmed write coverage across products, categories, collections, colors, customers, reviews, expenses, segments, transfers, popups, carts, chat, PO create/receive, and staff.

## What it should be (purpose)

A complete, tamper-evident record of **every** sensitive admin action — who did what, to which entity, when — that an operator can filter (by admin, action, date, entity) and drill into, for security and accountability.

## What's missing

1. **Partial write coverage** — some sensitive mutations are **not** logged: **supplier create/update/delete** and **PO update/delete** emit no `logAdminAction` (`purchasing.js`). Any gap means those actions are invisible in the trail (also noted in [suppliers.md](suppliers.md) / [purchase-orders.md](purchase-orders.md)).
2. **No server-side pagination/filtering in the UI** — the client fetches a flat `limit=300` and paginates in memory; there's no date-range/admin/action filter surfaced, and entries older than 300 are **unreachable** from the page (the backend's `entity_type` param is never used).
3. **No expand/detail view** — Dettagli JSON is line-clamped with no way to see the full payload beyond the CSV column.

## Fix outline

- **Close the coverage gaps** — add `logAdminAction` to supplier + PO update/delete handlers (bundle with [suppliers.md](suppliers.md)). **Effort: S.**
- **Server-side paging + filters** — add `?before`/date/admin/action params to `GET /audit-log` and wire filter controls; make older entries reachable. **Effort: M.**
- **Detail drawer** — expandable full-JSON view per row. **Effort: S.**

**Priority rationale — P2:** the log is real and correctly read-only, but an audit trail with **partial coverage** and a hard 300-row ceiling under-delivers on its one job (accountability) — the coverage fix is small and high-value.
