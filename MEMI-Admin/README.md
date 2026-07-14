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
Point the proxy elsewhere with `VITE_API_PROXY=http://localhost:3005 npm run dev` (local
docker maps the backend to host port 3005).
Start the backend first (repo root): `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`.

## Build / deploy
```bash
npm run build        # → dist/
docker build -t memi-admin-react .   # nginx serving dist/ + /api proxy to backend:3000
```
Deploy alongside the legacy admin with the repo-root overlay:
`docker compose -f docker-compose.yml -f docker-compose.admin-next.yml up --build admin-next`.

## Structure
```
src/
  components/ui/          shadcn primitives
  components/common/      PageHeader, KpiCard, StatusBadge, EmptyState, ConfirmDialog, EntityFormDialog
  components/data-table/  DataTable, ExportMenu, BulkActionBar, BulkDelete
  components/layout/      AppShell, Sidebar, Topbar
  hooks/                  use-auth, use-theme, queries (TanStack Query)
  lib/                    api, format, status, export, utils
  pages/                  one file per admin view
  nav.ts / routes.tsx     nav tree + route table
```

Views not yet ported route to a labelled "presto" placeholder; the legacy admin remains
the source of truth for those until each is rebuilt.
