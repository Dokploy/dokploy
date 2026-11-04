import type { IncomingMessage } from "node:http";
import { resolveComposeTask, validateRequest } from "@dokploy/server";
import type { WebSocket } from "ws";
import { type ContainerStatsSample, collectContainerStats } from "./container-stats";

type TaskTarget = Awaited<ReturnType<typeof resolveComposeTask>>;
type SharedSample = {
  promise: Promise<ContainerStatsSample>;
  controller: AbortController;
  users: number;
  expiresAt: number;
};
const samples = new Map<string, SharedSample>();
const pollDelayMs = 1300;

function sampleTask(target: TaskTarget, signal: AbortSignal): Promise<ContainerStatsSample> {
  signal.throwIfAborted();
  let entry = samples.get(target.statsKey);

  if (!entry || (entry.users === 0 && entry.expiresAt <= Date.now())) {
    const controller = new AbortController();
    const promise = collectContainerStats({
      containerId: target.containerId,
      statsKey: target.statsKey,
      serverId: target.serverId,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
    });

    entry = { promise, controller, users: 0, expiresAt: Number.POSITIVE_INFINITY };
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
  let abort: () => void;
  const result = new Promise<ContainerStatsSample>((resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void current.promise.then(resolve, reject);
  });

  return result.finally(() => {
    signal.removeEventListener("abort", abort);
    current.users -= 1;

    if (current.users === 0 && current.expiresAt === Number.POSITIVE_INFINITY) {
      current.controller.abort();

      if (samples.get(target.statsKey) === current) samples.delete(target.statsKey);
    }
  });
}

async function readSample(
  req: IncomingMessage,
  composeId: string,
  taskId: string,
  signal: AbortSignal,
): Promise<ContainerStatsSample> {
  signal.throwIfAborted();
  const { user, session } = await validateRequest(req);

  signal.throwIfAborted();

  if (!user || !session?.activeOrganizationId) throw new Error("Not authorized");

  const target = await resolveComposeTask(
    { user, session: { activeOrganizationId: session.activeOrganizationId } },
    composeId,
    taskId,
  );

  signal.throwIfAborted();

  return sampleTask(target, signal);
}

export async function subscribeComposeTaskStats(
  ws: WebSocket,
  req: IncomingMessage,
  composeId: string,
  taskId: string,
): Promise<void> {
  const controller = new AbortController();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  ws.once("close", () => {
    stopped = true;
    controller.abort();
    clearTimeout(timer);
    clearTimeout(deadline);
  });
  const poll = async (): Promise<void> => {
    if (stopped) return;

    deadline = setTimeout(() => {
      stopped = true;
      controller.abort();
      ws.close(4000, "Task monitoring timed out; reload the page or select another task");
    }, 15_000);

    try {
      const data = await readSample(req, composeId, taskId, controller.signal);

      if (!stopped && ws.readyState === 1) ws.send(JSON.stringify({ data }));
    } catch {
      if (!stopped) {
        stopped = true;
        controller.abort();
        ws.close(4000, "Task monitoring unavailable; reload the page or select another task");
      }
    } finally {
      clearTimeout(deadline);
    }

    if (!stopped) timer = setTimeout(poll, pollDelayMs);
  };

  await poll();
}
