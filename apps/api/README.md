# Deployment API

From the repository root, use Node 24.4.0 and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm server:build
pnpm --filter=@dokploy/api dev
pnpm --filter=@dokploy/api dev:inngest
```

The API listens on port 4000 in development. Inngest listens on port 8288 and
registers the API at `http://localhost:4000/api/inngest`.

## Queue ownership

The web server commits the deployment attempt and its pending cloud dispatch in
one PostgreSQL transaction. `POST /deploy` accepts `{ "deploymentId": "..." }` and
requires `X-API-Key`. The API reads the canonical job from PostgreSQL; callers
cannot replace its target or options. A missing API key configuration denies
requests.

Immediate delivery has a ten-second timeout. If the API or Inngest is unavailable,
the attempt stays queued. The `dispatch-pending-deployments` Inngest function
runs every minute and drains pending dispatches in batches of 100. Delivery is
acknowledged only after Inngest accepts the events. A crash before acknowledgment
replays the same event IDs. The worker also atomically claims each attempt once,
so duplicate delivery cannot execute the same attempt again, including after
Inngest's 24-hour event deduplication window.

Titles and descriptions stay in PostgreSQL; queue events contain execution
fields only. Pending dispatches are removed when their attempt starts or reaches
a terminal state. Deleting the owning service cascades through both records.

## Cancellation

Queue cleanup cancels a snapshot of waiting attempts. A concurrent enqueue after
the snapshot survives, and a worker that has already claimed an attempt wins
against cancellation. `POST /cancel-deployment` takes an attempt ID, cancels only
queued work, and returns 409 for running, terminal, or missing attempts.

Running cloud builds cannot be interrupted by this API. They remain running
until execution finishes; the long-running warning opens their logs. Cancelling
a queued run directly in Inngest is reconciled through its native cancellation
event. Cancelling an already executing Inngest run does not stop the underlying
build step or change the attempt to cancelled. Remote processes may also outlive
a worker crash; process termination and rollback are outside queue cancellation.

## Coordinated upgrade

This changes the private web/API and Inngest event contracts. Before upgrading:

1. Pause new deployment submissions and drain existing cloud Inngest runs.
2. Apply the web server's database migrations, including `0197_queued_deployments`.
3. Update the web server and deployment API together, then confirm Inngest has
   registered execution, pending-dispatch, and cancellation-reconciliation functions.
4. Resume submissions. Verify one queued attempt becomes running and completes
   with the same ID, and that cancelling a waiting sibling preserves the active build.

Do not mix the old web/API binaries with the new contract or replay old payloads.
The migration adds enum values and a dispatch table. Rolling back binaries alone
is unsafe once queued attempts exist; drain work and coordinate the rollback.
Self-hosted installs use the in-memory queue and cancel interrupted attempts on
startup before accepting requests. Cloud installs recover pending delivery through
Inngest instead of cancelling all queued work on web-server restart.

## Local verification

The repository's queue suite uses a disposable PostgreSQL database:

```sh
TEST_DATABASE_URL=postgres://dokploy:dokploy@localhost:5432/deployment_lifecycle \
  pnpm --filter=dokploy test run __test__/queues
```

It applies migrations and exercises real transactions, concurrent claims,
cleanup races, dispatch persistence, and cancellation ownership. Verify UI and
Inngest behavior separately; passing these tests does not prove a deployed cloud
upgrade or termination of an active remote process.
