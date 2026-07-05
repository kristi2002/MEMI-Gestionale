# MEMI documentation index

> Updated 2026-07-05. Start here.

## Current (authoritative)
| Doc | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System map, data flows, DB, payments integrity, caching/versioning |
| [api.md](api.md) | Full REST route reference (regenerated from code) |
| [STATUS.md](STATUS.md) | Honest feature matrix: wired vs partial vs façade |
| [GAPS-AND-PLAN.md](GAPS-AND-PLAN.md) | Gap analysis + phased implementation plan (2026-07) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Hetzner + Coolify operations, env vars, backup, verification |
| [integrations.md](integrations.md) | Route map used by verify/contract checks (keep in sync when adding routes) |
| [LOCAL-RUN.md](LOCAL-RUN.md) | Local development details |
| [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md) | Client demo script |
| [DEBUGGING.md](DEBUGGING.md) | Debugging recipes |

## Superseded (kept for history — do not trust for current state)
`gaps.md`, `GAPS-ANALYSIS.md`, `PRODUCTION-READINESS.md`, `PRODUCTION-ROADMAP.md`, `modules.md`,
`indexing.md` → replaced by STATUS.md + GAPS-AND-PLAN.md. Where these disagree with the code, the code wins.
