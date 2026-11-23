import type {
	EndpointSpecSwarm,
	PlacementSwarm,
} from "@dokploy/server/db/schema";
import type { ApplicationNested } from "../../utils/builders";
import {
	isDockerNotFoundError,
	type ServiceInspectInfo,
} from "../../utils/docker/swarm-service";
import {
	calculateResources,
	generateConfigContainer,
} from "../../utils/docker/utils";
import {
	type CapacityContext,
	type CapacityNode,
	type CapacityTask,
	computeCapacity,
	evaluateCapacity,
	type PlacementRequirements,
} from "./capacity";
import { getScalingDocker, type ScalableApplication } from "./status";
import { createTtlCache } from "./ttl-cache";

export interface CapacityApplication extends ScalableApplication {
	sourceType: string | null;
	registryId: string | null;
	buildRegistryId: string | null;
	cpuLimit: string | null;
	cpuReservation: string | null;
	memoryLimit: string | null;
	memoryReservation: string | null;
	placementSwarm: PlacementSwarm | null;
	endpointSpecSwarm: EndpointSpecSwarm | null;
	mounts: unknown[];
	ports: { publishMode: string; publishedPort: number }[];
}

const hostPortsOf = (
	ports: { PublishMode?: string; PublishedPort?: number }[] | undefined,
) =>
	(ports ?? [])
		.filter((port) => port.PublishMode === "host" && port.PublishedPort)
		.map((port) => port.PublishedPort as number);

export const requirementsFromSpec = (
	spec: ServiceInspectInfo["Spec"],
): PlacementRequirements => {
	const resources = spec?.TaskTemplate?.Resources;
	const placement = spec?.TaskTemplate?.Placement;
	return {
		cpuReservation: resources?.Reservations?.NanoCPUs ?? 0,
		memoryReservation: resources?.Reservations?.MemoryBytes ?? 0,
		cpuLimit: resources?.Limits?.NanoCPUs ?? 0,
		memoryLimit: resources?.Limits?.MemoryBytes ?? 0,
		constraints: placement?.Constraints ?? [],
		maxReplicasPerNode: placement?.MaxReplicas || null,
		hostPorts: hostPortsOf(spec?.EndpointSpec?.Ports),
	};
};

export const requirementsFromApplication = (
	application: CapacityApplication,
): PlacementRequirements => {
	const { Limits, Reservations } = calculateResources(application);
	const { Placement, EndpointSpec } = generateConfigContainer(
		application as unknown as Partial<ApplicationNested>,
	);
	return {
		cpuReservation: Reservations?.NanoCPUs || 0,
		memoryReservation: Reservations?.MemoryBytes || 0,
		cpuLimit: Limits?.NanoCPUs || 0,
		memoryLimit: Limits?.MemoryBytes || 0,
		constraints: Placement?.Constraints ?? [],
		maxReplicasPerNode: Placement?.MaxReplicas || null,
		hostPorts: hostPortsOf(
			EndpointSpec?.Ports ??
				application.ports.map((port) => ({
					PublishMode: port.publishMode,
					PublishedPort: port.publishedPort,
				})),
		),
	};
};

export const capacityContextOf = (
	application: CapacityApplication,
): CapacityContext => ({
	imageOnBuildNodeOnly:
		application.sourceType !== "docker" &&
		!application.registryId &&
		!application.buildRegistryId,
	hasVolumeMounts: application.mounts.length > 0,
	defaultManagerPin:
		!application.placementSwarm && application.mounts.length > 0,
});

interface Inventory {
	deployed: boolean;
	serviceId: string | null;
	requirements: PlacementRequirements;
	nodes: CapacityNode[];
	tasks: CapacityTask[];
}

interface ServiceInventory extends Inventory {
	spec: ServiceInspectInfo["Spec"] | null;
}

const readServiceInventory = async (
	target: Pick<ScalableApplication, "serverId" | "server">,
	serviceName: string,
	undeployedRequirements: () => PlacementRequirements,
): Promise<ServiceInventory> => {
	const docker = await getScalingDocker(target);
	let inspect: ServiceInspectInfo | null = null;
	try {
		inspect = await docker.getService(serviceName).inspect();
	} catch (error) {
		if (!isDockerNotFoundError(error)) throw error;
	}
	const [nodes, tasks] = await Promise.all([
		docker.listNodes() as Promise<CapacityNode[]>,
		// No desired-state filter: tasks that are shutting down still hold
		// their reservations until they stop.
		docker.listTasks() as Promise<CapacityTask[]>,
	]);
	return {
		deployed: !!inspect,
		serviceId: inspect?.ID ?? null,
		// The running spec is what Swarm schedules; stored settings only take
		// effect on the next deploy.
		requirements: inspect
			? requirementsFromSpec(inspect.Spec)
			: undeployedRequirements(),
		spec: inspect?.Spec ?? null,
		nodes,
		tasks,
	};
};

const readInventory = (application: CapacityApplication) =>
	readServiceInventory(application, application.appName, () =>
		requirementsFromApplication(application),
	);

const inventoryCache = createTtlCache<Inventory>(5_000);
const serviceInventoryCache = createTtlCache<ServiceInventory>(5_000);

export const getApplicationCapacity = async (
	application: CapacityApplication,
	requested: number,
	{ fresh = false }: { fresh?: boolean } = {},
) => {
	const inventory = fresh
		? await readInventory(application)
		: await inventoryCache.get(application.applicationId, () =>
				readInventory(application),
			);
	const report = computeCapacity({
		nodes: inventory.nodes,
		tasks: inventory.tasks,
		serviceId: inventory.serviceId,
		requirements: inventory.requirements,
	});
	return {
		...report,
		...evaluateCapacity(report, requested, capacityContextOf(application)),
		requested,
		deployed: inventory.deployed,
	};
};

export const invalidateApplicationCapacity = (applicationId: string) => {
	inventoryCache.delete(applicationId);
};

const NO_REQUIREMENTS: PlacementRequirements = {
	cpuReservation: 0,
	memoryReservation: 0,
	cpuLimit: 0,
	memoryLimit: 0,
	constraints: [],
	maxReplicasPerNode: null,
	hostPorts: [],
};

/**
 * Capacity of one service of a Stack. Its reservations and placement come
 * from the compose file, so until it is deployed nothing is known about them.
 */
export const getStackServiceCapacity = async (
	target: Pick<ScalableApplication, "serverId" | "server"> & {
		composeId: string;
	},
	swarmServiceName: string,
	requested: number,
	{ fresh = false }: { fresh?: boolean } = {},
) => {
	const key = `${target.composeId}/${swarmServiceName}`;
	const read = () =>
		readServiceInventory(target, swarmServiceName, () => NO_REQUIREMENTS);
	const inventory = fresh
		? await read()
		: await serviceInventoryCache.get(key, read);
	const report = computeCapacity({
		nodes: inventory.nodes,
		tasks: inventory.tasks,
		serviceId: inventory.serviceId,
		requirements: inventory.requirements,
	});
	const mounts = inventory.spec?.TaskTemplate?.ContainerSpec?.Mounts ?? [];
	return {
		...report,
		...evaluateCapacity(report, requested, {
			// stack deploy pins each image to its registry digest; one it
			// could not resolve was built or loaded on this node only.
			imageOnBuildNodeOnly:
				!!inventory.spec &&
				!inventory.spec.TaskTemplate?.ContainerSpec?.Image?.includes(
					"@sha256:",
				),
			hasVolumeMounts: mounts.some(
				(mount: { Type?: string }) => mount.Type === "volume",
			),
			defaultManagerPin: false,
			reservationsHint: "Set deploy.resources.reservations in the compose file",
			registryHint:
				"Push it to a registry and use that image in the compose file, or place the service on a single node.",
		}),
		requested,
		deployed: inventory.deployed,
	};
};

export const invalidateStackServiceCapacity = (
	composeId: string,
	swarmServiceName: string,
) => {
	serviceInventoryCache.delete(`${composeId}/${swarmServiceName}`);
};
