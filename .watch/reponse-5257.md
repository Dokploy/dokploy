Yes — tested manually against a real Infomaniak account, screenshots below.

![Providers](1-providers-list.jpg)
*Infomaniak in the provider selector, with its icon and label.*

![Zones](2-zones.jpg)
*The five zones the account manages, with record counts.*

![Records](3-records-olidian-io.jpg)
*The records of one zone.*

That third one is the one worth looking at: apex records render as `olidian.io`, not `..olidian.io`, and the TXT reads `v=spf1 -all` unquoted even though Infomaniak stores it as `"v=spf1 -all"`. Those are the two bugs the live testing turned up and that `be4a5da` fixes.

## On the Greptile summary in the description

It predates the fixes. It was generated on 2026-09-01T14:25 and Greptile hasn't re-run since, so the block still names the apex alias mismatch as blocking. That was fixed the same day in `be4a5da` — `normalizeSource` on the upsert lookup, plus a parametrized test over `"."`, `""` and `"@"` — and I replied on its thread at the time. GitHub marks both of your own threads on this PR as `outdated` for the same reason: the code moved past them.

Your two points were fixed in `59a7484`: the plural `/1/products` endpoint with pagination, and the single-use helper inlined.

## On "it's not working with a real account"

I'd really like to know what you saw, because I can't reproduce it: which provider, which step, and the exact error message would help a lot.

One strong candidate, and it isn't this PR. `canary` currently breaks self-hosted instances at login. `2e2e0c8c2` added the onboarding wizard, and `pages/dashboard/home.tsx` statically imports `onboarding-wizard.tsx`, which statically imports `steps/plan-step.tsx`, which calls at module scope:

```ts
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
```

The `isCloud` check inside the wizard only filters which steps render — the module is imported either way. Without `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` set, opening the dashboard throws:

```
IntegrationError: Missing value for Stripe(): apiKey should be a string
```

It hit our own instance this morning and blocked login until we set a placeholder key. Since I merged `canary` into both DNS branches on 2026-09-03, anyone checking them out inherits it — and it fires before you can reach Settings → DNS Providers. That would also explain why the same symptom appears on both PRs, which otherwise share no code.

Happy to open a separate issue for that if it's useful.
