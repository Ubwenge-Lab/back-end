# Explicit Out-of-Scope List (2026-Q4)
**Target Quarter:** 2026-Q4  
**Context:** Baseline Pack v1 Boundary Guardrail  
**Purpose:** Prevent scope creep, defend the locked denominator, and prohibit deferred architectural choices from being re-opened as "defects" in December 2026.  
**Sign-off:** CTO, Head of Product, and Engineering Lead

---

## 1. Guiding Principle

Performance optimization sprints fail when teams attempt to rewrite underlying architectures or bundle feature requests into performance PRs.

In accordance with leadership directives:
> **If an initiative cannot be traced to a baseline measurement captured in Baseline Pack v1, it is strictly out-of-scope for Q4.**

---

## 2. Explicit Out-of-Scope Items & Rationale

| # | Proposed Initiative / Request | Stated Rationale for Deferral | Scheduled Re-evaluation |
|---|---|---|---|
| **1** | **Microservice Decomposition / Extracting Auth or Billing** | Splitting NestJS monolith services into independent microservices introduces distributed transaction complexity, network overhead, and DevOps sprawl. The observed bottlenecks are database indexing and unbatched queries, which are resolved in-process within days. | Q2 2027 (Post-Scale Review) |
| **2** | **Migrating from Prisma ORM to Kysely, Drizzle, or Raw SQL** | While raw SQL is used for specific `EXPLAIN` analysis and complex migrations, replacing Prisma across the entire repository risks widespread regressions across 27+ service modules. The audit proved that Prisma query batching (`findMany`, `createMany`) resolves 90% of observed N+1 issues without ORM migration. | Q3 2027 |
| **3** | **Migrating Database from Supabase PostgreSQL to Self-Hosted Cloud** | Connection pool latency is addressed by prohibiting interactive transaction loops and adding composite indexes. Migrating database providers is high-risk and unneeded. | Out of scope indefinitely |
| **4** | **Wholesale Package Upgrades to Resolve All 55 AppSec Findings** | Blindly upgrading transitive dependencies or bumping major framework versions (e.g. NestJS 11 &rarr; 12, TypeScript, Sentry) introduces silent breaking changes. Part B establishes the automated CI detector (`npm audit --audit-level=high` and Dependabot). Existing CVEs will be triaged individually by severity. | Ongoing via Dependabot PRs |
| **5** | **GraphQL / tRPC API Layer Implementation** | RESTful NestJS controllers with class-validator DTOs remain the company API standard. Over-fetching is solved via Prisma `select` / `omit` projections, not by introducing a GraphQL gateway. | Out of scope indefinitely |
| **6** | **UI/UX Visual Reskinning & Design System Refactoring** | Frontend work is strictly bounded by Lighthouse scores, Core Web Vitals, and JS bundle size reductions. Aesthetic redesigns, icon changes, and subjective UI tweaks are not performance tasks. | Q1 2027 Design Sprint |
| **7** | **New Feature Development Disguised as Performance** | Requests such as "add automated POS customer loyalty points during checkout" or "add AI prescription OCR enhancement" alter commercial behavior and introduce new database load. No new features will merge during Weeks 6–9. | Product Backlog |
| **8** | **Zero-Downtime Multi-Region Database Replication** | Multi-region active-active database failover is unnecessary for current Rwandan and Ugandan traffic volumes. Supabase automated backups and high-availability read replicas meet current SLAs. | 2027 Infrastructure Roadmap |
| **9** | **Real-Time WebSockets for All Entity Mutations** | Socket.io is used strictly where already implemented (Chat / Notifications). Adding real-time WebSockets to order tracking or stock updates adds persistent connection strain on server instances without measurable conversion gain. | Q2 2027 |
| **10**| **Automated Shadow Database Migrations in CI (`prisma migrate dev`)** | `prisma migrate dev` creates shadow databases that fail against pooled connections and break CI pipelines. The repository uses deploy-only migrations (`prisma migrate deploy`) and ephemeral Postgres test containers (`prisma db push`). | Permanent Architectural Standard |

---

## 3. Scope Dispute Protocol (The "December Defense")

If any stakeholder, auditor, or product manager raises an issue in December claiming that one of the above items is a "defect" or "unmet requirement":
1. This signed **Out-of-Scope document** serves as the authoritative decision record.
2. The item must be rejected as an invalid defect and redirected to the Q1 2027 roadmap planning queue.
3. No engineer may be penalized or pulled off the locked 29-item denominator to service an out-of-scope item.

---

*Boundary guardrail signed and locked.*

