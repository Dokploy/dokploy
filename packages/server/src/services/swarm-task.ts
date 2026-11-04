import { TRPCError } from "@trpc/server";
import type Dockerode from "dockerode";
import { z } from "zod";
import { getRemoteDocker } from "../utils/servers/remote-docker";
import { findComposeById } from "./compose";
import { checkPermission, checkServiceAccess, type PermissionCtx } from "./permission";
import { findServerById } from "./server";

const namespaceLabel = "com.docker.stack.namespace";
const runningState = "running";
const taskSchema = z.object({
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
type Compose = Awaited<ReturnType<typeof findComposeById>>;
type ManagerContext = { compose: Compose; manager: Dockerode };
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
};

async function boundedRead<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new TRPCError({ code: "TIMEOUT", message: "Swarm node did not respond" })),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function authorizedDocker(ctx: PermissionCtx, serverId: string | null): Promise<Dockerode> {
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

  return getRemoteDocker(serverId);
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
  manager: Dockerode,
  taskId: string,
  appName: string,
): Promise<RunningTask> {
  const result = taskSchema.safeParse(await boundedRead(manager.getTask(taskId).inspect()));

  if (!result.success || result.data.ID !== taskId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Task is no longer running; refresh the task list",
    });
  }

  const service = await boundedRead(manager.getService(result.data.ServiceID).inspect());

  if (service.Spec.Labels?.[namespaceLabel] !== appName) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Task does not belong to this Compose stack",
    });
  }

  return result.data;
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
  const task = await inspectRunningTask(manager, taskId, compose.appName);
  const managerInfo = swarmInfoSchema.parse(await boundedRead(manager.info()));
  const managerSwarm = managerInfo.Swarm;

  if (!managerSwarm.Cluster || !managerSwarm.ControlAvailable) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Compose server is not an available Swarm manager",
    });
  }

  const serverId =
    task.NodeID === managerSwarm.NodeID ? compose.serverId : mappedServerId(task.NodeID);
  const docker =
    task.NodeID === managerSwarm.NodeID ? manager : await authorizedDocker(ctx, serverId);
  const targetInfo =
    docker === manager ? managerInfo : swarmInfoSchema.parse(await boundedRead(docker.info()));

  verifyNodeIdentity(managerSwarm, targetInfo.Swarm, task.NodeID);

  const node = await boundedRead(manager.getNode(task.NodeID).inspect());
  const service = await boundedRead(manager.getService(task.ServiceID).inspect());
  const current = await inspectRunningTask(manager, taskId, compose.appName);

  if (
    current.NodeID !== task.NodeID ||
    current.ServiceID !== task.ServiceID ||
    current.Status.ContainerStatus.ContainerID !== task.Status.ContainerStatus.ContainerID
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "Task changed; refresh the task list" });
  }

  return {
    docker,
    containerId: task.Status.ContainerStatus.ContainerID,
    taskId: task.ID,
    nodeId: task.NodeID,
    nodeName: node.Description.Hostname,
    serviceName: service.Spec.Name,
    serverId,
    statsKey: `${composeId}:${task.NodeID}:${task.Status.ContainerStatus.ContainerID}`,
  };
}

export async function listComposeTasks(
  ctx: PermissionCtx,
  composeId: string,
): Promise<ComposeTask[]> {
  const { compose, manager } = await composeManager(ctx, composeId, "read");
  const services = await boundedRead(
    manager.listServices({ filters: { label: [`${namespaceLabel}=${compose.appName}`] } }),
  );

  const ownedServices = services.filter(
    (service) => service.Spec?.Labels?.[namespaceLabel] === compose.appName,
  );

  if (ownedServices.length === 0) {
    return [];
  }

  const tasks = await boundedRead(
    manager.listTasks({
      filters: {
        service: ownedServices.map((service) => service.ID),
        "desired-state": [runningState],
      },
    }),
  );
  const nodes = await boundedRead(manager.listNodes());
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
