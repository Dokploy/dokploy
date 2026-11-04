import { Agent } from "node:http";
import { Duplex } from "node:stream";
import { TRPCError } from "@trpc/server";
import Dockerode from "dockerode";
import { z } from "zod";
import { openProcessStream, type ProcessStream } from "../utils/process/remoteStream";
import { getRemoteDocker } from "../utils/servers/remote-docker";
import { findComposeById } from "./compose";
import { checkPermission, checkServiceAccess, type PermissionCtx } from "./permission";
import { findServerById } from "./server";

const namespaceLabel = "com.docker.stack.namespace";
const runningState = "running";
const restartPolicySchema = z.object({
  Condition: z.string().optional(),
  MaxAttempts: z.number().int().nonnegative().optional(),
});

const taskSpecSchema = z.object({
  ContainerSpec: z.object({ StopGracePeriod: z.number().nonnegative().optional() }).optional(),
  RestartPolicy: restartPolicySchema.optional(),
});

const taskSchema = z.object({
  Spec: taskSpecSchema.optional(),
  ID: z.string().min(1),
  ServiceID: z.string().min(1),
  NodeID: z.string().min(1),
  Slot: z.number().optional(),
  DesiredState: z.literal(runningState),
  Status: z.object({
    State: z.literal(runningState),
    ContainerStatus: z.object({ ContainerID: z.string().regex(/^[a-f0-9]{64}$/) }),
  }),
});

const swarmInfoSchema = z.object({
  Swarm: z.object({
    NodeID: z.string().min(1),
    ControlAvailable: z.boolean(),
    Cluster: z.object({ ID: z.string().min(1) }).optional(),
    RemoteManagers: z
      .array(z.object({ NodeID: z.string().min(1) }))
      .nullable()
      .optional(),
  }),
});

type SwarmInfo = z.infer<typeof swarmInfoSchema>["Swarm"];

function verifyNodeIdentity(manager: SwarmInfo, target: SwarmInfo, nodeId: string): void {
  // Workers omit Cluster; their manager membership anchors them to this Swarm.
  const sameCluster = target.Cluster
    ? target.Cluster.ID === manager.Cluster?.ID
    : target.RemoteManagers?.some((remote) => remote.NodeID === manager.NodeID);

  if (target.NodeID !== nodeId || !sameCluster) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "SSH endpoint does not match the task's Swarm node and cluster",
    });
  }
}

type RunningTask = z.infer<typeof taskSchema>;
type InspectedTask = { task: RunningTask; service: Dockerode.Service };
type ReadOptions = { abortSignal: AbortSignal };
type DockerOperation<T> = (docker: Dockerode, options: ReadOptions) => Promise<T>;
type DockerTarget = { docker: Dockerode; serverId: string | null };
type ReadInfo = (options: ReadOptions) => Promise<object>;
type RestartPolicy = z.infer<typeof restartPolicySchema>;
type Compose = Awaited<ReturnType<typeof findComposeById>>;
type ManagerContext = { compose: Compose; manager: DockerTarget };
export type ComposeTask = {
  taskId: string;
  containerId: string;
  nodeId: string;
  nodeName: string;
  serviceName: string;
  name: string;
  state: string;
  slot?: number;
};
export type ResolvedComposeTask = {
  docker: Dockerode;
  containerId: string;
  taskId: string;
  nodeId: string;
  nodeName: string;
  serviceName: string;
  serverId: string | null;
  statsKey: string;
  stopTimeoutSeconds?: number;
};

async function withDockerConnection<T>(
  target: DockerTarget,
  operation: DockerOperation<T>,
  timeoutMs = 10_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let process: ProcessStream | undefined;
  let agent: Agent | undefined;

  try {
    let docker = target.docker;

    if (target.serverId) {
      process = await openProcessStream(
        target.serverId,
        "exec docker system dial-stdio",
        controller.signal,
      );
      const channel = process.stdout;

      if (!(channel instanceof Duplex) || process.stdin !== channel) {
        throw new Error("Docker SSH transport requires a duplex channel");
      }

      agent = new Agent({ keepAlive: false, maxSockets: 1 });
      agent.createConnection = () => channel;
      const options = { host: "localhost", port: 80, protocol: "http" as const, agent };

      docker = new Dockerode(options);
    }

    return await operation(docker, { abortSignal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new TRPCError({ code: "TIMEOUT", message: "Swarm node did not respond", cause: error });
    }

    throw error;
  } finally {
    clearTimeout(timer);
    agent?.destroy();
    process?.close();
  }
}

async function readSwarmInfo(target: DockerTarget): Promise<SwarmInfo> {
  const raw = await withDockerConnection(target, (docker, options) => {
    // Dockerode accepts options at runtime, but its info declaration omits them.
    const info = docker.info.bind(docker) as ReadInfo;

    return info(options);
  });

  return swarmInfoSchema.parse(raw).Swarm;
}

function hasUnlimitedRestarts(policy: RestartPolicy | undefined): boolean {
  return (policy?.Condition ?? "any") === "any" && (policy?.MaxAttempts ?? 0) === 0;
}

function isServiceTask(task: RunningTask, mode: Dockerode.ServiceMode | undefined): boolean {
  if (!mode || Object.keys(mode).length !== 1) return false;

  if (mode.Global) return true;

  const replicas = mode.Replicated?.Replicas;

  return (
    task.Slot !== undefined &&
    Number.isInteger(task.Slot) &&
    task.Slot > 0 &&
    replicas !== undefined &&
    task.Slot <= replicas
  );
}

function restartStopTimeout(task: RunningTask, service: Dockerode.Service): number {
  const taskSpec = task.Spec;
  const serviceSpec = taskSpecSchema.safeParse(service.Spec?.TaskTemplate);

  if (
    !taskSpec?.ContainerSpec ||
    !serviceSpec.success ||
    !isServiceTask(task, service.Spec?.Mode) ||
    !hasUnlimitedRestarts(taskSpec.RestartPolicy) ||
    !hasUnlimitedRestarts(serviceSpec.data.RestartPolicy)
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Task restart requires a replicated or global service with unlimited restart condition 'any'",
    });
  }

  // Swarm applies task grace during shutdown; it is not the container's default stop timeout.
  return Math.ceil((taskSpec.ContainerSpec.StopGracePeriod ?? 10_000_000_000) / 1_000_000_000);
}

async function authorizedDocker(
  ctx: PermissionCtx,
  serverId: string | null,
): Promise<DockerTarget> {
  if (serverId) {
    const server = await findServerById(serverId);

    if (server.organizationId !== ctx.session.activeOrganizationId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Server belongs to another organization" });
    }

    // getRemoteDocker otherwise silently falls back to the local daemon.
    if (!server.sshKeyId || !server.sshKey?.privateKey?.trim()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Swarm server requires an SSH key",
      });
    }
  }

  return { docker: await getRemoteDocker(serverId), serverId };
}

async function composeManager(
  ctx: PermissionCtx,
  composeId: string,
  action: "read" | "restart",
): Promise<ManagerContext> {
  const compose = await findComposeById(composeId);

  if (compose.environment.project.organizationId !== ctx.session.activeOrganizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Compose belongs to another organization" });
  }

  await checkServiceAccess(ctx, composeId, "read");

  if (action === "restart") {
    await checkPermission(ctx, { docker: ["read"] });
  }

  if (compose.composeType !== "stack") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Compose is not a Swarm stack" });
  }

  return { compose, manager: await authorizedDocker(ctx, compose.serverId) };
}

async function inspectRunningTask(
  manager: DockerTarget,
  taskId: string,
  appName: string,
): Promise<InspectedTask> {
  try {
    const result = taskSchema.safeParse(
      await withDockerConnection(manager, (docker, options) =>
        docker.getTask(taskId).inspect(options),
      ),
    );

    if (!result.success || result.data.ID !== taskId) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Task is no longer running; refresh the task list",
      });
    }

    const service: Dockerode.Service = await withDockerConnection(manager, (docker, options) =>
      docker.getService(result.data.ServiceID).inspect(options),
    );

    if (service.Spec?.Labels?.[namespaceLabel] !== appName || !service.Spec.Name) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Task does not belong to this Compose stack",
      });
    }

    return { task: result.data, service };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 404
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Task no longer exists; refresh task list",
        cause: error,
      });
    }

    throw error;
  }
}

function mappedServerId(nodeId: string): string {
  let mapping: Record<string, string>;

  try {
    mapping = z
      .record(z.string(), z.string().min(1))
      .parse(JSON.parse(process.env.DOKPLOY_SWARM_NODE_SERVERS ?? "{}"));
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Invalid Swarm node server mapping",
    });
  }

  const serverId = Object.hasOwn(mapping, nodeId) ? mapping[nodeId] : undefined;

  if (!serverId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Swarm node has no registered SSH server mapping",
    });
  }

  return serverId;
}

export async function resolveComposeTask(
  ctx: PermissionCtx,
  composeId: string,
  taskId: string,
  action: "read" | "restart" = "read",
): Promise<ResolvedComposeTask> {
  if (!/^[a-z0-9]{25}$/.test(taskId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid Swarm task ID" });
  }

  const { compose, manager } = await composeManager(ctx, composeId, action);
  const { task } = await inspectRunningTask(manager, taskId, compose.appName);
  const managerSwarm = await readSwarmInfo(manager);

  if (!managerSwarm.Cluster || !managerSwarm.ControlAvailable) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Compose server is not an available Swarm manager",
    });
  }

  const serverId =
    task.NodeID === managerSwarm.NodeID ? compose.serverId : mappedServerId(task.NodeID);
  const target =
    task.NodeID === managerSwarm.NodeID ? manager : await authorizedDocker(ctx, serverId);
  const targetSwarm = target === manager ? managerSwarm : await readSwarmInfo(target);

  verifyNodeIdentity(managerSwarm, targetSwarm, task.NodeID);

  const node = await withDockerConnection(manager, (docker, options) =>
    docker.getNode(task.NodeID).inspect(options),
  );
  const { task: current, service } = await inspectRunningTask(manager, taskId, compose.appName);

  if (
    current.NodeID !== task.NodeID ||
    current.ServiceID !== task.ServiceID ||
    current.Status.ContainerStatus.ContainerID !== task.Status.ContainerStatus.ContainerID
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "Task changed; refresh the task list" });
  }

  return {
    docker: target.docker,
    containerId: task.Status.ContainerStatus.ContainerID,
    taskId: task.ID,
    nodeId: task.NodeID,
    nodeName: node.Description.Hostname,
    serviceName: service.Spec!.Name!,
    serverId,
    ...(action === "restart" && { stopTimeoutSeconds: restartStopTimeout(current, service) }),
    statsKey: `${composeId}:${task.NodeID}:${task.Status.ContainerStatus.ContainerID}`,
  };
}

export async function listComposeTasks(
  ctx: PermissionCtx,
  composeId: string,
): Promise<ComposeTask[]> {
  const { compose, manager } = await composeManager(ctx, composeId, "read");
  const services = await withDockerConnection(manager, (docker, options) =>
    docker.listServices({
      ...options,
      filters: { label: [`${namespaceLabel}=${compose.appName}`] },
    }),
  );

  const ownedServices = services.filter(
    (service) => service.Spec?.Labels?.[namespaceLabel] === compose.appName,
  );

  if (ownedServices.length === 0) {
    return [];
  }

  const tasks = await withDockerConnection(manager, (docker, options) =>
    docker.listTasks({
      ...options,
      filters: {
        service: ownedServices.map((service) => service.ID),
        "desired-state": [runningState],
      },
    }),
  );
  const nodes = await withDockerConnection(manager, (docker, options) => docker.listNodes(options));
  const result: ComposeTask[] = [];

  for (const candidate of tasks) {
    const parsed = taskSchema.safeParse(candidate);

    if (!parsed.success) {
      continue;
    }

    const task = parsed.data;
    const service = ownedServices.find((item) => item.ID === task.ServiceID);
    const node = nodes.find((item) => item.ID === task.NodeID);

    if (!service?.Spec?.Name || !node) {
      continue;
    }

    result.push({
      taskId: task.ID,
      containerId: task.Status.ContainerStatus.ContainerID,
      nodeId: task.NodeID,
      nodeName: node.Description.Hostname,
      serviceName: service.Spec.Name,
      name: `${service.Spec.Name}.${task.Slot ?? task.NodeID}.${task.ID}`,
      state: task.Status.State,
      slot: task.Slot,
    });
  }

  return result;
}

export async function stopResolvedComposeTask(target: ResolvedComposeTask): Promise<void> {
  if (target.stopTimeoutSeconds === undefined) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Task restart was not validated" });
  }

  const seconds = target.stopTimeoutSeconds;
  const deadlineMs = Math.min((seconds + 10) * 1000, 2_147_483_647);

  // Restarting a task container can revive it after Swarm has scheduled its replacement.
  await withDockerConnection(
    target,
    (docker, options) => docker.getContainer(target.containerId).stop({ ...options, t: seconds }),
    deadlineMs,
  );
}
