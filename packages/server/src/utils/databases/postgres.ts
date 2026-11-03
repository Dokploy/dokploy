import path from "node:path";
import { paths } from "@dokploy/server/constants";
import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions } from "dockerode";
import { quote } from "shell-quote";
import { resolveServiceNetworks } from "../../services/network";
import { buildDokployLabels } from "../docker/dokploy-labels";
import {
	calculateResources,
	generateBindMounts,
	generateConfigContainer,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRemoteDocker } from "../servers/remote-docker";
import { withResolvedVaultRefs } from "../vault";
import {
	buildPostgresSslArgs,
	buildPostgresSslCertScript,
	buildPostgresSslSan,
	getSslCertMount,
	type PostgresSslMode,
} from "./postgres-ssl";

export type PostgresNested = InferResultType<
	"postgres",
	{ mounts: true; environment: { with: { project: true } } }
>;

interface PostgresSslCertInput {
	appName: string;
	serverId: string | null;
	sslMode: PostgresSslMode;
	server?: { ipAddress: string | null } | null;
}

export const getPostgresSslDir = (appName: string, serverId?: string | null) =>
	path.join(path.resolve(paths(!!serverId).APPLICATIONS_PATH), appName, "ssl");

export const ensurePostgresSslCerts = async (
	postgres: PostgresSslCertInput,
	onData?: (data: string) => void,
): Promise<string> => {
	const sslDir = getPostgresSslDir(postgres.appName, postgres.serverId);
	const script = buildPostgresSslCertScript({
		sslDir,
		san: buildPostgresSslSan({
			appName: postgres.appName,
			serverIp: postgres.server?.ipAddress,
		}),
		appName: postgres.appName,
		required: postgres.sslMode === "required",
	});
	const { stdout } = postgres.serverId
		? await execAsyncRemote(postgres.serverId, script, onData)
		: await execAsync(script);
	return stdout.trim();
};

export const removePostgresSslCerts = async (
	appName: string,
	serverId?: string | null,
) => {
	const sslDir = getPostgresSslDir(appName, serverId);
	const command = `rm -rf ${quote([sslDir])}`;
	if (serverId) {
		await execAsyncRemote(serverId, command);
	} else {
		await execAsync(command);
	}
};

export const buildPostgres = async (rawPostgres: PostgresNested) => {
	const postgres = await withResolvedVaultRefs(rawPostgres);
	const {
		appName,
		env,
		externalPort,
		dockerImage,
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
		databaseName,
		databaseUser,
		databasePassword,
		command,
		args,
		mounts,
	} = postgres;

	const defaultPostgresEnv = `POSTGRES_DB="${databaseName}"\nPOSTGRES_USER="${databaseUser}"\nPOSTGRES_PASSWORD="${databasePassword}"${
		env ? `\n${env}` : ""
	}`;

	const resolvedNetworks = await resolveServiceNetworks(postgres);

	const {
		HealthCheck,
		RestartPolicy,
		Placement,
		Labels,
		Mode,
		RollbackConfig,
		UpdateConfig,
		StopGracePeriod,
		EndpointSpec,
		Ulimits,
	} = generateConfigContainer(postgres);
	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});
	const envVariables = prepareEnvironmentVariables(
		defaultPostgresEnv,
		postgres.environment.project.env,
		postgres.environment.env,
	);
	const volumesMount = generateVolumeMounts(mounts);
	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, postgres);
	const sslEnabled = postgres.sslMode !== "disabled";
	const sslMount = sslEnabled
		? [getSslCertMount(getPostgresSslDir(appName, postgres.serverId))]
		: [];
	const sslArgs = buildPostgresSslArgs({
		command,
		args,
		sslMode: postgres.sslMode,
	});
	const containerArgs = sslArgs ?? (args && args.length > 0 ? args : undefined);

	const docker = await getRemoteDocker(postgres.serverId);

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				HealthCheck,
				Image: dockerImage,
				Env: envVariables,
				Mounts: [...volumesMount, ...bindsMount, ...filesMount, ...sslMount],
				StopGracePeriod: StopGracePeriod ?? 30_000_000_000,
				...(command && {
					Command: command.split(" "),
				}),
				...(containerArgs && {
					Args: containerArgs,
				}),
				...(Ulimits && { Ulimits }),
				Labels: {
					...Labels,
					...buildDokployLabels({
						organizationId: postgres.environment.project.organizationId,
						projectId: postgres.environment.projectId,
						projectName: postgres.environment.project.name,
						environmentId: postgres.environmentId,
						environmentName: postgres.environment.name,
						applicationId: postgres.postgresId,
						applicationName: postgres.name,
					}),
				},
			},
			Networks: resolvedNetworks,
			RestartPolicy,
			Placement,
			Resources: {
				...resources,
			},
		},
		Mode,
		RollbackConfig,
		EndpointSpec: EndpointSpec
			? EndpointSpec
			: {
					Mode: "dnsrr" as const,
					Ports: externalPort
						? [
								{
									Protocol: "tcp" as const,
									TargetPort: 5432,
									PublishedPort: externalPort,
									PublishMode: "host" as const,
								},
							]
						: [],
				},
		UpdateConfig: postgres.updateConfigSwarm ?? {
			Parallelism: 1,
			Order: "stop-first" as const,
			FailureAction: "rollback" as const,
		},
	};
	try {
		const service = docker.getService(appName);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: inspect.Spec.TaskTemplate.ForceUpdate + 1,
			},
		});
	} catch (error) {
		console.log("error", error);
		await docker.createService(settings);
	}
};
