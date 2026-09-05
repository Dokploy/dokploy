Yes — tested manually against a real OVHcloud account (24 zones). Screenshots below, and the detailed results were already on this PR, though spread across review threads rather than in one place — summarising both here.

![Add provider](1-providers-list.jpg)
*OVHcloud in the provider selector, and the corrected permission hint from `f83097b` listing the five rights.*

![Zones](2-zones.jpg)
*The 24 zones the credentials can manage.*

![Records](3-records-moninfraprivee.jpg)
*One zone's records: apex, CNAME, A, MX, TXT, NS — and an `SPF` record, see the note below.*

## What was verified against the live API

Full cycle through the Dokploy UI's endpoints, with **every mutation confirmed by `dig` against the zone's authoritative nameserver** rather than trusting the API's own response:

| Step | Result |
|---|---|
| `testConnection` / `listZones` | 24 zones — request signing and the server-clock timestamp work |
| `listRecords` | apex, subdomains and wildcards (`*.lab0.…`) mapped correctly |
| create | new record, resolves via `dig` |
| create again, same name and type | **same id returned** — no duplicate |
| update | content and TTL changed, `dig` confirms |
| type change A → CNAME | **new id** returned, i.e. the delete-and-recreate path ran; `dig` resolves the CNAME |
| delete | `NXDOMAIN` on the authoritative nameserver, zone left with its original records |

Two failure paths were exercised deliberately rather than only mocked:

- **Rollback on a failed type change** — I forced the replacement `POST` to fail (type change to `AAAA` while keeping an IPv4 target, which OVH rejects on its own validation). The original error surfaces, the record comes back with its type, name, TTL and target intact, and `dig` resolves it again, which also proves the `/refresh` inside the restore path. Detail worth knowing: the restore recreates the record, so **OVH assigns it a new id** — that's unavoidable through this API, and losing the record seemed clearly worse.
- **The permission problem you spotted** — I created a consumer key carrying exactly one rule, `GET /domain/zone/*`, and confirmed via `/auth/currentCredential` that was really all it had:

  ```
  GET /domain/zone                  -> 403  This call has not been granted
  GET /domain/zone/                 -> 200  (24 zones)
  GET /domain/zone/{zone}/record    -> 200
  ```

  You were right, and it was worse than a documentation gap: a token created by following the form's old hint literally could not list zones at all. Fixed in `f83097b` — the hint now lists the five rights verbatim, and a 403 on that call names the missing one instead of echoing OVH's message.

Two things the screenshots make visible.

Loading a zone's records is noticeably slower than for the other providers. That's inherent to the API — `GET /domain/zone/{zone}/record` returns ids only, so each record needs its own request. The fan-out is capped at 8 concurrent requests to stay within OVH's rate limits.

And the `SPF` row is worth a look: OVH still exposes record types that Dokploy's `dnsRecordTypes` doesn't include. I flagged this in the PR description as a limitation, but I described it imprecisely — I said editing one is rejected by the shared zod enum. In practice `show-dns-records.tsx` already gates the edit action on `DNS_RECORD_TYPES.includes(record.type)`, so the pencil simply isn't offered on that row while delete still is. The existing UI handles it more gracefully than I gave it credit for; the record is listed truthfully and can't be edited into an invalid state. I'll correct the description.

## On the Greptile summary in the description

It predates the fixes. It was generated on 2026-09-01T14:25 and Greptile hasn't re-run since, so the block still lists both findings as blocking. Since then, on its own threads:

- the failed-type-replacement rollback was fixed in `80a6baf`, and Greptile confirmed: *"This live verification addresses the concern […] no further change is needed for this comment."*
- the multi-value RRset finding it **withdrew**: *"You're right — this is a deliberate and defensible trade-off, not an OVH-specific correctness bug […] I'll withdraw this finding; no change is needed here."*

GitHub marks those threads `outdated` for the same reason — the code moved past them.

## On "it's not working with a real account"

I'd really like to know what you saw, because I can't reproduce it: which step, and the exact error message would help a lot.

One strong candidate, and it isn't this PR. `canary` currently breaks self-hosted instances at login. `2e2e0c8c2` added the onboarding wizard, and `pages/dashboard/home.tsx` statically imports `onboarding-wizard.tsx`, which statically imports `steps/plan-step.tsx`, which calls at module scope:

```ts
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
```

The `isCloud` check inside the wizard only filters which steps render — the module is imported either way. Without `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` set, opening the dashboard throws:

```
IntegrationError: Missing value for Stripe(): apiKey should be a string
```

It hit our own instance this morning and blocked login until we set a placeholder key. Since I merged `canary` into both DNS branches on 2026-09-03, anyone checking them out inherits it — and it fires before you can reach Settings → DNS Providers. That would also explain why the same symptom appears on this PR and on #5257, which otherwise share no code.

Happy to open a separate issue for that if it's useful.
