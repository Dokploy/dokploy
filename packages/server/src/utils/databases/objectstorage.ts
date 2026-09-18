import crypto from "node:crypto";
import path from "node:path";
import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions } from "dockerode";
import { paths } from "../../constants";
import { resolveServiceNetworks } from "../../services/network";
import {
	calculateResources,
	createFile,
	generateBindMounts,
	generateConfigContainer,
	generateFileMounts,
	generateVolumeMounts,
	getCreateFileCommand,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";
import { getRemoteDocker } from "../servers/remote-docker";
import { withResolvedVaultRefs } from "../vault";

export type ObjectStorageNested = InferResultType<
	"objectstorage",
	{ mounts: true; environment: { with: { project: true } }; server: true }
>;

const INTERNAL_PORTS: Record<string, number> = {
	minio: 9000,
	garage: 3900,
	alarik: 8080,
	rustfs: 9000,
};

const CONSOLE_PORTS: Record<string, number> = {
	minio: 9001,
	rustfs: 9001,
};

function generateGarageConfig(region: string): string {
	const rpcSecret = crypto.randomBytes(32).toString("hex");
	const adminToken = crypto.randomBytes(24).toString("base64");
	const metricsToken = crypto.randomBytes(24).toString("base64");

	return `metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
metadata_auto_snapshot_interval = "6h"

rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "${rpcSecret}"

[s3_api]
s3_region = "${region || "us-east-1"}"
api_bind_addr = "[::]:3900"

[s3_web]
bind_addr = "[::]:3902"

[admin]
api_bind_addr = "[::]:3903"
admin_token = "${adminToken}"
metrics_token = "${metricsToken}"
`;
}

export const buildObjectStorage = async (rawOs: ObjectStorageNested) => {
	const os = await withResolvedVaultRefs(rawOs);
	const {
		appName,
		provider,
		env,
		externalPort,
		dockerImage,
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
		rootUser,
		rootPassword,
		bucket,
		region,
		command,
		args,
		mounts,
	} = os;

	let providerEnv = "";
	let providerCommand = command;
	const providerArgs = args;

	if (provider === "minio") {
		providerEnv = `MINIO_ROOT_USER="${rootUser}"\nMINIO_ROOT_PASSWORD="${rootPassword}"${
			env ? `\n${env}` : ""
		}`;
		providerCommand = providerCommand || "server /data --console-address :9001";
	} else if (provider === "garage") {
		providerEnv = `GARAGE_DEFAULT_ACCESS_KEY="${rootUser}"\nGARAGE_DEFAULT_SECRET_KEY="${rootPassword}"\nGARAGE_DEFAULT_BUCKET="${bucket || "dokploy"}"${
			env ? `\n${env}` : ""
		}`;
		providerCommand =
			providerCommand || "/garage server --single-node --default-bucket";

		const { APPLICATIONS_PATH } = paths(!!os.serverId);
		const configContent = generateGarageConfig(region || "us-east-1");
		const configFilePath = path.join(appName, "files", "garage.toml");

		if (os.serverId) {
			const command = getCreateFileCommand(
				APPLICATIONS_PATH,
				configFilePath,
				configContent,
			);
			await execAsyncRemote(os.serverId, command);
		} else {
			await createFile(APPLICATIONS_PATH, configFilePath, configContent);
		}
	} else if (provider === "alarik") {
		const jwtSecret = crypto.randomBytes(32).toString("hex");
		providerEnv = `ADMIN_USERNAME="${rootUser}"\nADMIN_PASSWORD="${rootPassword}"\nJWT="${jwtSecret}"\nALLOW_ACCOUNT_CREATION=true${
			bucket ? `\nDEFAULT_BUCKETS="${bucket}"` : ""
		}${env ? `\n${env}` : ""}`;
		providerCommand =
			providerCommand ||
			"Alarik serve --env production --hostname 0.0.0.0 --port 8080";
	} else if (provider === "rustfs") {
		providerEnv = `RUSTFS_ACCESS_KEY="${rootUser}"\nRUSTFS_SECRET_KEY="${rootPassword}"\nRUSTFS_REGION="${region || "us-east-1"}"${
			env ? `\n${env}` : ""
		}`;
		providerCommand = providerCommand || "/usr/bin/rustfs /data";
	}

	const resolvedNetworks = await resolveServiceNetworks(os);

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
	} = generateConfigContainer(os);
	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});
	const envVariables = prepareEnvironmentVariables(
		providerEnv,
		os.environment.project.env,
		os.environment.env,
	);
	const volumesMount = generateVolumeMounts(mounts);
	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, os);

	// For Garage, add a bind mount for the generated garage.toml config file
	if (provider === "garage") {
		const { APPLICATIONS_PATH } = paths(!!os.serverId);
		const configPath = path.join(
			APPLICATIONS_PATH,
			appName,
			"files",
			"garage.toml",
		);
		bindsMount.push({
			Type: "bind" as const,
			Source: configPath,
			Target: "/etc/garage.toml",
		});
	}

	const docker = await getRemoteDocker(os.serverId);

	const internalPort = INTERNAL_PORTS[provider] || 9000;
	const consolePortInternal = CONSOLE_PORTS[provider];

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				HealthCheck,
				Image: dockerImage,
				Env: envVariables,
				Mounts: [...volumesMount, ...bindsMount, ...filesMount],
				StopGracePeriod: StopGracePeriod ?? 30_000_000_000,
				...(providerCommand && {
					Command: providerCommand.split(" "),
				}),
				...(providerArgs &&
					providerArgs.length > 0 && {
						Args: providerArgs,
					}),
				...(Ulimits && { Ulimits }),
				Labels,
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
					Ports: [
						...(externalPort
							? [
									{
										Protocol: "tcp" as const,
										TargetPort: internalPort,
										PublishedPort: externalPort,
										PublishMode: "host" as const,
									},
								]
							: []),
						...(consolePortInternal && os.consolePort
							? [
									{
										Protocol: "tcp" as const,
										TargetPort: consolePortInternal,
										PublishedPort: os.consolePort,
										PublishMode: "host" as const,
									},
								]
							: []),
					],
				},
		UpdateConfig: os.updateConfigSwarm ?? {
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
