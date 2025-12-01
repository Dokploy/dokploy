/**
 * SwarmAdapter - Docker Swarm Implementation of IOrchestratorAdapter
 *
 * This adapter wraps the existing Docker Swarm functionality to conform to
 * the IOrchestratorAdapter interface, ensuring backward compatibility.
 */

import type Dockerode from "dockerode";
import type { CreateServiceOptions } from "dockerode";
import type { IOrchestratorAdapter } from "./base.interface";
import type {
	Deployment,
	DeploymentConfig,
	DeploymentStatus,
	HealthStatus,
	Ingress,
	IngressConfig,
	LogOptions,
	OrchestratorType,
	ResourceMetrics,
	Service,
	ServiceConfig,
	ServerConfig,
} from "./types";
import { getRemoteDocker } from "../../utils/servers/remote-docker";
import {
	execAsync,
	execAsyncRemote,
} from "../../utils/process/execAsync";

export class SwarmAdapter implements IOrchestratorAdapter {
	private docker: Dockerode | null = null;
	private serverConfig: ServerConfig;

	constructor(config: ServerConfig) {
		this.serverConfig = config;
	}

	/**
	 * Initialize Docker connection
	 */
	private async getDocker(): Promise<Dockerode> {
		if (!this.docker) {
			this.docker = await getRemoteDocker(this.serverConfig.serverId || undefined);
		}
		return this.docker;
	}

	/**
	 * Execute command on server (local or remote)
	 */
	private async exec(command: string): Promise<{ stdout: string; stderr: string }> {
		if (this.serverConfig.serverId) {
			return execAsyncRemote(this.serverConfig.serverId, command);
		}
		return execAsync(command);
	}

	// ==========================================================================
	// Detection & Health
	// ==========================================================================

	async detect(): Promise<OrchestratorType> {
		try {
			const docker = await this.getDocker();
			const info = await docker.swarmInspect();
			if (info && info.ID) {
				return "swarm";
			}
		} catch {
			// Not a swarm node
		}
		return "swarm"; // Default to swarm for this adapter
	}

	async healthCheck(): Promise<HealthStatus> {
		try {
			const docker = await this.getDocker();
			const info = await docker.info();
			const swarmInfo = info.Swarm;

			if (!swarmInfo || swarmInfo.LocalNodeState !== "active") {
				return {
					healthy: false,
					message: "Docker Swarm is not active",
				};
			}

			return {
				healthy: true,
				message: "Docker Swarm is healthy",
				details: {
					version: info.ServerVersion,
					nodes: swarmInfo.Nodes,
					apiEndpoint: this.serverConfig.ipAddress,
					lastCheck: new Date(),
				},
			};
		} catch (error) {
			return {
				healthy: false,
				message: `Failed to connect to Docker: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	async getVersion(): Promise<string> {
		const docker = await this.getDocker();
		const info = await docker.info();
		return info.ServerVersion || "unknown";
	}

	// ==========================================================================
	// Deployment Management
	// ==========================================================================

	async deployApplication(config: DeploymentConfig): Promise<Deployment> {
		const docker = await this.getDocker();

		const serviceSettings = this.buildSwarmServiceSpec(config);

		try {
			// Try to update existing service first
			const service = docker.getService(config.name);
			const inspect = await service.inspect();

			await service.update({
				version: Number.parseInt(inspect.Version.Index),
				...serviceSettings,
				TaskTemplate: {
					...serviceSettings.TaskTemplate,
					ForceUpdate: (inspect.Spec?.TaskTemplate?.ForceUpdate || 0) + 1,
				},
			});
		} catch {
			// Service doesn't exist, create it
			await docker.createService(serviceSettings);
		}

		// Return deployment info
		return this.getDeploymentFromService(config.name);
	}

	async getDeployment(name: string, _namespace?: string): Promise<Deployment | null> {
		try {
			return await this.getDeploymentFromService(name);
		} catch {
			return null;
		}
	}

	private async getDeploymentFromService(name: string): Promise<Deployment> {
		const docker = await this.getDocker();
		const service = docker.getService(name);
		const inspect = await service.inspect();

		// Get running tasks
		const tasks = await docker.listTasks({
			filters: JSON.stringify({
				service: [name],
				"desired-state": ["running"],
			}),
		});

		const runningTasks = tasks.filter(t => t.Status?.State === "running");
		const desiredReplicas = inspect.Spec?.Mode?.Replicated?.Replicas || 1;

		let status: DeploymentStatus = "running";
		if (runningTasks.length === 0) {
			status = "pending";
		} else if (runningTasks.length < desiredReplicas) {
			status = "scaling";
		}

		return {
			name,
			status,
			replicas: {
				desired: desiredReplicas,
				ready: runningTasks.length,
				available: runningTasks.length,
			},
			image: inspect.Spec?.TaskTemplate?.ContainerSpec?.Image || "",
			createdAt: new Date(inspect.CreatedAt || Date.now()),
			updatedAt: new Date(inspect.UpdatedAt || Date.now()),
		};
	}

	async scaleApplication(name: string, replicas: number, _namespace?: string): Promise<void> {
		const { stdout, stderr } = await this.exec(
			`docker service scale ${name}=${replicas}`,
		);

		if (stderr && !stdout.includes("converged")) {
			throw new Error(`Failed to scale service: ${stderr}`);
		}
	}

	async updateApplication(
		name: string,
		config: Partial<DeploymentConfig>,
		_namespace?: string,
	): Promise<Deployment> {
		const docker = await this.getDocker();
		const service = docker.getService(name);
		const inspect = await service.inspect();

		// Build partial update
		const currentSpec = inspect.Spec;
		const updateSpec: CreateServiceOptions = {
			...currentSpec,
			TaskTemplate: {
				...currentSpec?.TaskTemplate,
				ContainerSpec: {
					...currentSpec?.TaskTemplate?.ContainerSpec,
					...(config.image && { Image: config.image }),
					...(config.env && {
						Env: Object.entries(config.env).map(([k, v]) => `${k}=${v}`),
					}),
					...(config.command && { Command: config.command }),
					...(config.args && { Args: config.args }),
				},
				ForceUpdate: (currentSpec?.TaskTemplate?.ForceUpdate || 0) + 1,
			},
			...(config.replicas && {
				Mode: {
					Replicated: { Replicas: config.replicas },
				},
			}),
		};

		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...updateSpec,
		});

		return this.getDeploymentFromService(name);
	}

	async deleteApplication(name: string, _namespace?: string): Promise<void> {
		const { stderr } = await this.exec(`docker service rm ${name}`);

		if (stderr && !stderr.includes("not found")) {
			throw new Error(`Failed to delete service: ${stderr}`);
		}
	}

	async rollbackApplication(
		name: string,
		_revision?: number,
		_namespace?: string,
	): Promise<void> {
		const { stderr } = await this.exec(`docker service rollback ${name}`);

		if (stderr) {
			throw new Error(`Failed to rollback service: ${stderr}`);
		}
	}

	async restartApplication(name: string, _namespace?: string): Promise<void> {
		const docker = await this.getDocker();
		const service = docker.getService(name);
		const inspect = await service.inspect();

		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...inspect.Spec,
			TaskTemplate: {
				...inspect.Spec?.TaskTemplate,
				ForceUpdate: (inspect.Spec?.TaskTemplate?.ForceUpdate || 0) + 1,
			},
		});
	}

	async listDeployments(
		_namespace?: string,
		labelSelector?: string,
	): Promise<Deployment[]> {
		const docker = await this.getDocker();

		const filters: { [key: string]: string[] } = {};
		if (labelSelector) {
			filters.label = [labelSelector];
		}

		const services = await docker.listServices({
			filters: Object.keys(filters).length > 0 ? JSON.stringify(filters) : undefined,
		});

		const deployments: Deployment[] = [];
		for (const svc of services) {
			if (svc.Spec?.Name) {
				try {
					const deployment = await this.getDeploymentFromService(svc.Spec.Name);
					deployments.push(deployment);
				} catch {
					// Skip failed services
				}
			}
		}

		return deployments;
	}

	// ==========================================================================
	// Service Discovery
	// ==========================================================================

	async createService(config: ServiceConfig): Promise<Service> {
		// In Swarm, services are combined with deployments
		// This is mainly for K8s compatibility
		const docker = await this.getDocker();

		const serviceSpec: CreateServiceOptions = {
			Name: config.name,
			TaskTemplate: {
				ContainerSpec: {
					Image: "nginx:alpine", // Placeholder, should be overridden
					Labels: config.selector,
				},
				Networks: [{ Target: "dokploy-network" }],
			},
			EndpointSpec: {
				Ports: config.ports.map(p => ({
					Protocol: (p.protocol?.toLowerCase() || "tcp") as "tcp" | "udp",
					TargetPort: p.targetPort,
					PublishedPort: p.port,
				})),
			},
		};

		try {
			await docker.createService(serviceSpec);
		} catch {
			// Service might already exist
		}

		return {
			name: config.name,
			type: "ClusterIP",
			ports: config.ports,
			selector: config.selector,
		};
	}

	async getService(name: string, _namespace?: string): Promise<Service | null> {
		try {
			const docker = await this.getDocker();
			const service = docker.getService(name);
			const inspect = await service.inspect();

			return {
				name: inspect.Spec?.Name || name,
				type: "ClusterIP",
				ports: (inspect.Endpoint?.Ports || []).map(p => ({
					port: p.PublishedPort || 0,
					targetPort: p.TargetPort || 0,
					protocol: (p.Protocol?.toUpperCase() || "TCP") as "TCP" | "UDP",
				})),
				selector: inspect.Spec?.TaskTemplate?.ContainerSpec?.Labels || {},
			};
		} catch {
			return null;
		}
	}

	async updateService(
		name: string,
		config: Partial<ServiceConfig>,
		_namespace?: string,
	): Promise<Service> {
		const docker = await this.getDocker();
		const service = docker.getService(name);
		const inspect = await service.inspect();

		const updateSpec: Partial<CreateServiceOptions> = {};

		if (config.ports) {
			updateSpec.EndpointSpec = {
				Ports: config.ports.map(p => ({
					Protocol: (p.protocol?.toLowerCase() || "tcp") as "tcp" | "udp",
					TargetPort: p.targetPort,
					PublishedPort: p.port,
				})),
			};
		}

		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...inspect.Spec,
			...updateSpec,
		});

		return this.getService(name) as Promise<Service>;
	}

	async deleteService(name: string, _namespace?: string): Promise<void> {
		await this.deleteApplication(name);
	}

	// ==========================================================================
	// Ingress/Routing (Traefik)
	// ==========================================================================

	async configureIngress(config: IngressConfig): Promise<Ingress> {
		// In Swarm mode, Traefik uses Docker labels for routing
		// This is handled separately through the Traefik file provider
		// For now, return a stub - actual implementation uses createTraefikConfig
		return {
			name: config.name,
			hosts: [config.domain],
			tls: config.ssl,
			rules: [
				{
					host: config.domain,
					paths: [
						{
							path: config.pathPrefix || "/",
							pathType: "Prefix",
							serviceName: config.serviceName,
							servicePort: config.servicePort,
						},
					],
				},
			],
		};
	}

	async getIngress(name: string, _namespace?: string): Promise<Ingress | null> {
		// Swarm ingress is managed via Traefik file configs
		// Return null - actual check would read traefik config files
		return null;
	}

	async deleteIngress(name: string, _namespace?: string): Promise<void> {
		// Swarm ingress is managed via Traefik file configs
		// Actual implementation would delete the traefik config file
	}

	// ==========================================================================
	// Monitoring & Logs
	// ==========================================================================

	async getMetrics(name: string, _namespace?: string): Promise<ResourceMetrics | null> {
		try {
			const docker = await this.getDocker();

			// Get container IDs for the service
			const tasks = await docker.listTasks({
				filters: JSON.stringify({
					service: [name],
					"desired-state": ["running"],
				}),
			});

			if (tasks.length === 0) {
				return null;
			}

			// Get stats from first container
			const containerId = tasks[0]?.Status?.ContainerStatus?.ContainerID;
			if (!containerId) {
				return null;
			}

			const container = docker.getContainer(containerId);
			const stats = await container.stats({ stream: false });

			const cpuDelta =
				stats.cpu_stats.cpu_usage.total_usage -
				stats.precpu_stats.cpu_usage.total_usage;
			const systemDelta =
				stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
			const cpuPercent = (cpuDelta / systemDelta) * 100;

			const memUsage = stats.memory_stats.usage || 0;
			const memLimit = stats.memory_stats.limit || 1;
			const memPercent = (memUsage / memLimit) * 100;

			return {
				name,
				timestamp: new Date(),
				containers: [
					{
						name: containerId.substring(0, 12),
						cpu: {
							usage: `${cpuPercent.toFixed(2)}%`,
							usageNanoCores: stats.cpu_stats.cpu_usage.total_usage,
						},
						memory: {
							usage: `${(memUsage / 1024 / 1024).toFixed(2)}Mi`,
							usageBytes: memUsage,
						},
					},
				],
				totalCPU: `${cpuPercent.toFixed(2)}%`,
				totalMemory: `${memPercent.toFixed(2)}%`,
			};
		} catch {
			return null;
		}
	}

	async getLogs(
		name: string,
		options?: LogOptions,
		_namespace?: string,
	): Promise<string[]> {
		const tailArg = options?.tailLines ? `--tail ${options.tailLines}` : "";
		const sinceArg = options?.sinceSeconds
			? `--since ${options.sinceSeconds}s`
			: "";
		const timestampsArg = options?.timestamps ? "--timestamps" : "";

		const { stdout } = await this.exec(
			`docker service logs ${name} ${tailArg} ${sinceArg} ${timestampsArg} 2>&1`,
		);

		return stdout.split("\n").filter(Boolean);
	}

	async streamLogs(
		name: string,
		callback: (log: string) => void,
		options?: LogOptions,
		_namespace?: string,
	): Promise<() => void> {
		// Swarm doesn't have native log streaming via API
		// Use polling as fallback
		let running = true;
		let lastTimestamp = options?.sinceTime || new Date();

		const poll = async () => {
			while (running) {
				try {
					const logs = await this.getLogs(name, {
						...options,
						sinceTime: lastTimestamp,
					});

					for (const log of logs) {
						callback(log);
					}

					lastTimestamp = new Date();
				} catch {
					// Ignore errors in streaming
				}

				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		};

		poll();

		return () => {
			running = false;
		};
	}

	// ==========================================================================
	// Events
	// ==========================================================================

	async getEvents(
		name: string,
		_namespace?: string,
	): Promise<
		Array<{
			type: "Normal" | "Warning";
			reason: string;
			message: string;
			count: number;
			firstTimestamp: Date;
			lastTimestamp: Date;
		}>
	> {
		// Docker Swarm doesn't have a native events API like K8s
		// Return service task events instead
		const docker = await this.getDocker();

		const tasks = await docker.listTasks({
			filters: JSON.stringify({
				service: [name],
			}),
		});

		return tasks.map(task => ({
			type: (task.Status?.State === "failed" ? "Warning" : "Normal") as "Normal" | "Warning",
			reason: task.Status?.State || "Unknown",
			message: task.Status?.Message || "",
			count: 1,
			firstTimestamp: new Date(task.Status?.Timestamp || Date.now()),
			lastTimestamp: new Date(task.Status?.Timestamp || Date.now()),
		}));
	}

	// ==========================================================================
	// Private Helpers
	// ==========================================================================

	private buildSwarmServiceSpec(config: DeploymentConfig): CreateServiceOptions {
		const envVars = Object.entries(config.env).map(([k, v]) => `${k}=${v}`);

		const mounts = (config.volumes || []).map(v => ({
			Type: (v.pvcName ? "volume" : "bind") as "bind" | "volume",
			Source: v.hostPath || v.pvcName || v.name,
			Target: v.mountPath,
			ReadOnly: v.readOnly,
		}));

		const spec: CreateServiceOptions = {
			Name: config.name,
			TaskTemplate: {
				ContainerSpec: {
					Image: config.image,
					Env: envVars,
					Labels: {
						"dokploy.managed": "true",
						...config.labels,
					},
					Mounts: mounts,
					...(config.command && { Command: config.command }),
					...(config.args && { Args: config.args }),
					...(config.healthCheck && {
						HealthCheck: {
							Test: config.healthCheck.exec?.command || [
								"CMD-SHELL",
								config.healthCheck.httpGet
									? `curl -f http://localhost:${config.healthCheck.httpGet.port}${config.healthCheck.httpGet.path} || exit 1`
									: "exit 0",
							],
							Interval: config.healthCheck.periodSeconds * 1000000000,
							Timeout: config.healthCheck.timeoutSeconds * 1000000000,
							Retries: config.healthCheck.failureThreshold,
							StartPeriod: config.healthCheck.initialDelaySeconds * 1000000000,
						},
					}),
				},
				Networks: [{ Target: "dokploy-network" }],
				...(config.resources && {
					Resources: {
						Limits: {
							NanoCPUs: this.parseCPU(config.resources.limits.cpu),
							MemoryBytes: this.parseMemory(config.resources.limits.memory),
						},
						Reservations: {
							NanoCPUs: this.parseCPU(config.resources.requests.cpu),
							MemoryBytes: this.parseMemory(config.resources.requests.memory),
						},
					},
				}),
				RestartPolicy: {
					Condition: "on-failure",
					MaxAttempts: 3,
				},
			},
			Mode: {
				Replicated: {
					Replicas: config.replicas,
				},
			},
			EndpointSpec: {
				Ports: config.ports.map(p => ({
					Protocol: (p.protocol?.toLowerCase() || "tcp") as "tcp" | "udp",
					TargetPort: p.containerPort,
					PublishedPort: p.publishedPort,
					PublishMode: p.publishMode || "ingress",
				})),
			},
			UpdateConfig: {
				Parallelism: 1,
				Delay: 10000000000, // 10 seconds
				FailureAction: "rollback",
				Order: "start-first",
			},
			RollbackConfig: {
				Parallelism: 1,
				Delay: 10000000000,
				FailureAction: "pause",
				Order: "start-first",
			},
		};

		return spec;
	}

	private parseCPU(cpu: string): number {
		// Convert K8s CPU format (e.g., "100m", "0.5") to nanocores
		const match = cpu.match(/^(\d+(?:\.\d+)?)(m)?$/);
		if (!match) return 100000000; // Default 0.1 CPU

		const value = Number.parseFloat(match[1]);
		if (match[2] === "m") {
			return value * 1000000; // millicores to nanocores
		}
		return value * 1000000000; // cores to nanocores
	}

	private parseMemory(memory: string): number {
		// Convert K8s memory format (e.g., "128Mi", "1Gi") to bytes
		const match = memory.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti)?$/);
		if (!match) return 134217728; // Default 128Mi

		const value = Number.parseFloat(match[1]);
		const unit = match[2];

		switch (unit) {
			case "Ki":
				return value * 1024;
			case "Mi":
				return value * 1024 * 1024;
			case "Gi":
				return value * 1024 * 1024 * 1024;
			case "Ti":
				return value * 1024 * 1024 * 1024 * 1024;
			default:
				return value;
		}
	}
}
