import type { IncomingMessage } from "node:http";
import { resolveComposeTask, validateRequest } from "@dokploy/server";
import type { WebSocket } from "ws";
import { z } from "zod";

const cpuSchema = z.object({
  cpu_usage: z.object({
    total_usage: z.number(),
    percpu_usage: z.array(z.number()).optional(),
  }),
  system_cpu_usage: z.number(),
  online_cpus: z.number().optional(),
});

const statsSchema = z.object({
  read: z.string().datetime({ offset: true }),
  cpu_stats: cpuSchema,
  precpu_stats: cpuSchema,
  memory_stats: z.object({
    usage: z.number().nonnegative(),
    limit: z.number().positive(),
    stats: z.record(z.string(), z.number()),
  }),
  networks: z
    .record(z.string(), z.object({ rx_bytes: z.number(), tx_bytes: z.number() }))
    .optional(),
  blkio_stats: z
    .object({
      io_service_bytes_recursive: z
        .array(z.object({ op: z.string(), value: z.number() }))
        .nullable()
        .optional(),
    })
    .optional(),
});

type RawStats = z.infer<typeof statsSchema>;
type TaskTarget = Awaited<ReturnType<typeof resolveComposeTask>>;
type ChartSample = {
  cpu: { time: string; value: string };
  memory: { time: string; value: { used: string; total: string } };
  block: { time: string; value: { readMb: number; writeMb: number } };
  network: { time: string; value: { inputMb: number; outputMb: number } };
};
type SharedSample = {
  promise: Promise<ChartSample>;
  users: number;
  expiresAt: number;
};
const samples = new Map<string, SharedSample>();
const pollDelayMs = 1300;

function cpuUsage(stats: RawStats): string {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpus = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 0;
  const percent = cpuDelta > 0 && systemDelta > 0 ? (cpuDelta / systemDelta) * cpus * 100 : 0;

  return `${percent.toFixed(2)}%`;
}

function chartSample(stats: RawStats): ChartSample {
  const time = stats.read;
  const memory = stats.memory_stats;
  // Match Docker CLI's Linux cache exclusion on cgroup v1 and v2.
  const cache = memory.stats.total_inactive_file ?? memory.stats.inactive_file ?? 0;
  const used = cache < memory.usage ? memory.usage - cache : memory.usage;
  let readMb = 0;
  let writeMb = 0;
  let inputMb = 0;
  let outputMb = 0;

  for (const item of stats.blkio_stats?.io_service_bytes_recursive ?? []) {
    if (item.op.toLowerCase() === "read") readMb += item.value / 1_000_000;

    if (item.op.toLowerCase() === "write") writeMb += item.value / 1_000_000;
  }

  for (const network of Object.values(stats.networks ?? {})) {
    inputMb += network.rx_bytes / 1_000_000;
    outputMb += network.tx_bytes / 1_000_000;
  }

  return {
    cpu: { time, value: cpuUsage(stats) },
    memory: { time, value: { used: `${used}B`, total: `${memory.limit}B` } },
    block: { time, value: { readMb, writeMb } },
    network: { time, value: { inputMb, outputMb } },
  };
}

function sampleTask(target: TaskTarget): Promise<ChartSample> {
  let entry = samples.get(target.statsKey);

  if (!entry || (entry.users === 0 && entry.expiresAt <= Date.now())) {
    // Dockerode supports abortSignal at runtime; its stats declaration omits it.
    const options = { stream: false as const, abortSignal: AbortSignal.timeout(10_000) };
    const promise = target.docker
      .getContainer(target.containerId)
      .stats(options)
      .then((raw) => chartSample(statsSchema.parse(raw)));

    entry = { promise, users: 0, expiresAt: Number.POSITIVE_INFINITY };
    samples.set(target.statsKey, entry);
    const current = entry;
    const expire = (): void => {
      current.expiresAt = Date.now() + pollDelayMs;
      const timer = setTimeout(() => {
        if (samples.get(target.statsKey) === current) samples.delete(target.statsKey);
      }, pollDelayMs);

      timer.unref();
    };

    void promise.then(expire, expire);
  }

  entry.users += 1;
  const current = entry;

  return current.promise.finally(() => {
    current.users -= 1;
  });
}

async function readSample(
  req: IncomingMessage,
  composeId: string,
  taskId: string,
): Promise<ChartSample> {
  const { user, session } = await validateRequest(req);

  if (!user || !session?.activeOrganizationId) throw new Error("Not authorized");

  const target = await resolveComposeTask(
    { user, session: { activeOrganizationId: session.activeOrganizationId } },
    composeId,
    taskId,
  );

  return sampleTask(target);
}

export async function subscribeComposeTaskStats(
  ws: WebSocket,
  req: IncomingMessage,
  composeId: string,
  taskId: string,
): Promise<void> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  ws.once("close", () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(deadline);
  });
  const poll = async (): Promise<void> => {
    if (stopped) return;

    deadline = setTimeout(() => {
      stopped = true;
      ws.close(4000, "Task monitoring timed out; refresh to reconnect");
    }, 15_000);

    try {
      const data = await readSample(req, composeId, taskId);

      if (!stopped && ws.readyState === 1) ws.send(JSON.stringify({ data }));
    } catch {
      stopped = true;
      ws.close(4000, "Task monitoring unavailable; refresh the task list or check access");
    } finally {
      clearTimeout(deadline);
    }

    if (!stopped) timer = setTimeout(poll, pollDelayMs);
  };

  await poll();
}
