# MEMI documentation index

> **Updated 2026-07-10** (go-live truth-pass). Start here. Where any doc disagrees with the
> code, **the code wins** — this pass reconciled the known drift, but treat old dated docs with care.

## Start here for go-live
| Doc | Contents |
|---|---|
| [GO-LIVE-PLAN-2026-07.md](GO-LIVE-PLAN-2026-07.md) | **The live plan + full gap analysis** (severity-ranked, code-verified) |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Canonical environment-variable reference (every var, required/optional, defaults) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Hetzner + Coolify operations, deploy flow, persistence, verification |
| [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) | Italian go-live checklist (DNS, first-boot, backup/monitoring cron) |
| [SECURITY.md](SECURITY.md) | Auth model, RBAC, rate limits, headers, known hardening gaps |

## Reference (authoritative, regenerated from code 2026-07-10)
| Doc | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System map, data flows, DB, payments integrity, caching/versioning |
| [api.md](api.md) | Full REST route reference — ~150 endpoints across 37 route files |
| [STATUS.md](STATUS.md) | Honest feature matrix: wired vs partial (ghost-views corrected) |
| [STOREFRONT.md](STOREFRONT.md) | Storefront (customer-facing) architecture |
| [admin/](admin/) | 10-file admin panel doc set (`01-overview` → `10-testing-and-runbook`) |
| [integrations.md](integrations.md) | Route map used by verify/contract checks (keep in sync when adding routes) |
| [LOCAL-RUN.md](LOCAL-RUN.md) | Local development details |
| [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md) | Client demo script (danger-zone corrected 2026-07-10) |
| [DEBUGGING.md](DEBUGGING.md) | Debugging recipes |

## Historical (kept for provenance — snapshots, not current state)
`gaps.md`, `GAPS-ANALYSIS.md`, `GAPS-AND-PLAN.md`, `PRODUCTION-ROADMAP.md`, `modules.md`,
`indexing.md` are point-in-time records. Some (e.g. `PRODUCTION-ROADMAP.md`, `GAPS-ANALYSIS.md`)
are newer than the earlier "superseded" labels suggested; their **completed** items are real, but
for current state trust the reference set above + the code. The 2026-07-05 "ghost views are mock"
claims in the older gap docs are **superseded** — those features are built (see STATUS.md).
