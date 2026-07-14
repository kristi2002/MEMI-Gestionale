# MEMI Admin (React)

A React/TypeScript rewrite of the MEMI Gestionale admin panel. It runs **alongside**
the legacy jQuery admin in [`../MEMI`](../MEMI) and talks to the **same** backend API
(no endpoint changes) via the HttpOnly `memi_admin_token` cookie.

## Stack
Vite · React 18 · TypeScript · Tailwind CSS · shadcn/ui (Radix) · TanStack Query · TanStack Table.

## Develop
```bash
npm install
npm run dev          # http://localhost:5174  (proxies /api → http://localhost:3000)
```
Point the proxy elsewhere with `VITE_API_PROXY=https://api.memi.testdemo.it npm run dev`.
Start the backend first (repo root): `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`.

## Build / deploy
```bash
npm run build        # → dist/
docker build -t memi-admin-react .   # nginx serving dist/ + /api proxy to backend:3000
```
The `Dockerfile` mirrors the legacy admin's serve setup (SPA fallback + `/api` proxy).
Cutover = point the compose `admin` service (or a new `admin-next` service) at this image.

## What's implemented (first delivery)
- **Foundation:** design system (tokens ported from the legacy CSS, light + dark),
  app shell (collapsible sidebar with the full nav tree, topbar, auth guard, login),
  typed API client + React Query data layer.
- **Reusable `DataTable`** with row selection, sorting, client search, pagination,
  server "load more", a **floating bulk-action bar**, and a multi-format **export menu**:
  CSV · Excel (XLSX) · PDF · JSON · Print · Copy. It also surfaces the backend's own
  exports (CSV import template, Meta/Google Shopping feed) on the Products page.
- **Fully-wired pages:** Dashboard, Orders, Products, Customers, Sconti (Discounts).

Every other view in the sidebar routes to a labelled placeholder and is still served
by the legacy admin until ported in a later batch.

## Structure
```
src/
  components/ui/          shadcn primitives
  components/common/      PageHeader, KpiCard, StatusBadge, EmptyState, ConfirmDialog
  components/data-table/  DataTable, ExportMenu, BulkActionBar
  components/layout/      AppShell, Sidebar, Topbar
  hooks/                  use-auth, use-theme, queries (TanStack Query)
  lib/                    api, format, status, export, utils
  pages/                  dashboard, orders, products, customers, discounts, login, placeholder
  nav.ts / routes.tsx     nav tree + route table
```
