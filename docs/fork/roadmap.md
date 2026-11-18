# Madrox Roadmap

Base: Dokploy `canary`. Governing rules: `.specify/memory/constitution.md`.

New capabilities go through Spec Kit (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
`/speckit-implement`). Integration work is tracked as GitHub issues and PRs.

## v1

| # | Work | Track | Source | Notes |
|---|------|-------|--------|-------|
| 001 | Remove `/proprietary`, stub the core files that import it, delete the license cron and gates, no phone-home | Spec Kit | Own | First feature; everything else builds on it |
| 002 | TaskFlow Swarm and reliability fixes | Issue/PR | TaskFlow-Systems/dokploy `AgentHits-Dev` | Merges cleanly onto upstream; drop its edits to `proprietary/` files; provenance check |
| 003 | OIDC SSO with IdP group → role mapping, SSO-only mode, break-glass login | Spec Kit | Own spec on better-auth's MIT `sso` plugin | Built without Milpia's code; tested end to end against local Authentik (`dev/authentik`) |
| 004 | Audit log: always-on trail, viewer, filters, CSV export, retention | Spec Kit | Behavioural spec; ghaaf-labs/crane as design reference | Uses the existing `audit()` calls |
| 005 | Upstream PRs for AWS and Swarm | Issue/PR | Dokploy PRs #4141 (ECR), #5270, #5702, #5828, #5187, #5218/#5776, #5205, #4405, #5038 (terminal) | Port as-is with credit. Add a scheduled job that refreshes ECR tokens (IAM role) every 6h and re-applies registry auth to services, since Swarm workers ignore credential helpers and ECR tokens expire after 12h |
| 006 | Consolidate migrations into one chain; test upgrade from an upstream database | Issue/PR | Own | After 002–005 land |
| 007 | Rebrand to Madrox, CI, image publishing, install script | Spec Kit | Own | Name chosen: Madrox |
| 008 | End-to-end QA on a multi-node Swarm in AWS | Issue | Own | Release gate |
| 009 | Zero egress: delete analytics, tracking, billing, Cloud services, update check, self-update, IP lookups; content policy; CI host allowlist | Spec Kit | Own | Follows 001; user requires removal, not switches |

## Later

| Work | Track | Source |
|------|-------|--------|
| Custom roles (fine-grained RBAC beyond SSO group mapping) | Spec Kit | Behavioural spec |
| Deploy-by-digest builds, Compose rolling replace, deploy queue controls | Issue/PR | DevinoSolutions/dokploy-community (cherry-pick, provenance check) |
| Reliability and performance fixes | Issue/PR | 0x00-sys/dokploy |
