# Madrox Constitution

Madrox is the product name for this Apache-2.0 fork of Dokploy.

## Core Principles

### I. Apache-2.0 Only, Clean Room (NON-NEGOTIABLE)

- No file under any `proprietary/` path is read, copied, translated or adapted. The proprietary
  folders are deleted from this codebase.
- Replacement features (SSO, RBAC, audit log) are built only from written behavioural specs that
  describe what the product does, never how upstream's proprietary code does it.
- Code taken from a third-party fork MUST have a recorded provenance check before merge and MUST
  keep its author credit.
- Upstream Apache attribution (LICENSE, NOTICE, copyright lines) is preserved.
- The shipped product MUST NOT use Dokploy trademarks (name, logo).

Rationale: the fork must be usable in production without a commercial agreement, and its
independence from DSAL-licensed code must be defensible.

### II. No Phone-Home

- The product MUST NOT contact vendor-controlled endpoints: license servers, analytics,
  telemetry or marketing services.
- Every outbound network call is either triggered by an operator action or is configurable and
  can be disabled.
- The platform MUST run in an isolated VPC whose egress allows only operator-configured
  registries, git hosts and identity providers.

Rationale: target environments forbid unsanctioned egress; any hidden call is a deployment blocker.

### III. Thin Delta on Upstream

- Stay close to Dokploy `canary`. Fork-specific code lives in separate modules and files rather
  than scattered edits to upstream files.
- Port an existing upstream PR as-is, with credit, before writing an independent implementation.
- Sync with upstream at least weekly. Apply upstream security advisories within 72 hours.

Rationale: upstream ships roughly 60 commits a week; the cost of every sync grows with the size
and spread of our delta.

### IV. One Linear Migration Chain

- Database migrations are additive and live in a single ordered chain.
- Migrations brought in from upstream or forks are renumbered into that chain, never merged as
  parallel branches.
- Every release is tested upgrading from the latest upstream Dokploy database.

Rationale: operators must be able to move from upstream Dokploy to this fork without data loss.

### V. Multi-Node Correctness

- Every feature MUST work on a Docker Swarm with workers and on remote servers, not only on a
  single host.
- Swarm-specific behaviour (rollouts, task placement, registry pulls) is verified on a real
  multi-node cluster before release.

Rationale: the fork exists to run highly available workloads across nodes.

### VI. Verification Gates

- `pnpm typecheck`, Biome and the Vitest suite pass on every PR.
- Auth, permission and audit changes require tests that cover the denial paths, not only the
  allowed ones.
- SSO is tested end to end against at least one real identity provider.

Rationale: identity and access bugs are security bugs.

### VII. Code Style

- Follow CLAUDE.md: comment only the non-obvious "why" (workarounds, counterintuitive decisions,
  external API constraints).
- No comments that restate the code, no section-divider comments, no comments narrating a change.

## Licensing & Provenance

- Each fork-sourced change records its origin (repository, commit, author) in the PR description
  and states how its provenance was checked.
- A PR that touches identity, permissions or audit code states that no `proprietary/` file was
  consulted.

## Development Workflow

- New capabilities (the proprietary cut, SSO, RBAC, audit log, new platform features) go through
  Spec Kit: spec, plan with a constitution check, tasks, implementation.
- Integration work (upstream syncs, ported upstream PRs, fork cherry-picks, migration
  consolidation) is tracked as GitHub issues and PRs, not as specs.
- Every PR links its spec or issue and passes the verification gates in Principle VI.

## Governance

- This constitution supersedes other project practice where they conflict.
- Every plan includes a constitution check; any violation is listed with its justification in the
  plan's complexity tracking.
- Amendments are made by PR, bump the version (MAJOR for removed or redefined principles, MINOR
  for added principles or sections, PATCH for clarifications) and update the dates below.

**Version**: 1.0.1 | **Ratified**: 2026-11-05 | **Last Amended**: 2026-11-18
