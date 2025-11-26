import type { ContainerCreateOptions } from "dockerode";
import { pullImage, pullRemoteImage } from "../utils/docker/utils";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { getRemoteDocker } from "../utils/servers/remote-docker";

/**
 * Setup Prometheus server for monitoring
 */
export const setupPrometheus = async (serverId?: string) => {
	const prometheusConfig = generatePrometheusConfig();

	if (serverId) {
		await setupRemotePrometheus(serverId, prometheusConfig);
	} else {
		await setupLocalPrometheus(prometheusConfig);
	}
};

/**
 * Setup local Prometheus (for web server)
 */
const setupLocalPrometheus = async (prometheusConfig: string) => {
	const containerName = "dokploy-prometheus";
	const imageName = "prom/prometheus:latest";

	// Create prometheus config directory
	await execAsync(
		"mkdir -p /etc/dokploy/prometheus && chmod 755 /etc/dokploy/prometheus",
	);

	// Write prometheus configuration
	await execAsync(
		`echo '${prometheusConfig}' > /etc/dokploy/prometheus/prometheus.yml`,
	);

	const settings: ContainerCreateOptions = {
		name: containerName,
		Image: imageName,
		Cmd: [
			"--config.file=/etc/prometheus/prometheus.yml",
			"--storage.tsdb.path=/prometheus",
			"--web.console.libraries=/usr/share/prometheus/console_libraries",
			"--web.console.templates=/usr/share/prometheus/consoles",
			"--web.enable-lifecycle",
		],
		HostConfig: {
			RestartPolicy: {
				Name: "always",
			},
			PortBindings: {
				"9090/tcp": [
					{
						HostPort: "9090",
					},
				],
			},
			Binds: [
				"/etc/dokploy/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro",
				"/etc/dokploy/prometheus/data:/prometheus",
			],
			NetworkMode: "bridge",
		},
		ExposedPorts: {
			"9090/tcp": {},
		},
	};

	const docker = await getRemoteDocker();

	try {
		await pullImage(imageName);

		// Check if container exists
		const container = docker.getContainer(containerName);
		try {
			await container.inspect();
			await container.remove({ force: true });
			console.log("Removed existing Prometheus container");
		} catch {
			// Container doesn't exist, continue
		}

		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();

		console.log("Prometheus Started");
	} catch (error) {
		console.error("Failed to start Prometheus:", error);
		throw error;
	}
};

/**
 * Setup remote Prometheus (for remote servers)
 */
const setupRemotePrometheus = async (
	serverId: string,
	prometheusConfig: string,
) => {
	const containerName = "dokploy-prometheus";
	const imageName = "prom/prometheus:latest";

	// Create prometheus config directory on remote server
	await execAsyncRemote(
		serverId,
		"mkdir -p /etc/dokploy/prometheus && chmod 755 /etc/dokploy/prometheus",
	);

	// Write prometheus configuration to remote server
	const escapedConfig = prometheusConfig.replace(/'/g, "'\\''");
	await execAsyncRemote(
		serverId,
		`echo '${escapedConfig}' > /etc/dokploy/prometheus/prometheus.yml`,
	);

	const settings: ContainerCreateOptions = {
		name: containerName,
		Image: imageName,
		Cmd: [
			"--config.file=/etc/prometheus/prometheus.yml",
			"--storage.tsdb.path=/prometheus",
			"--web.console.libraries=/usr/share/prometheus/console_libraries",
			"--web.console.templates=/usr/share/prometheus/consoles",
			"--web.enable-lifecycle",
		],
		HostConfig: {
			RestartPolicy: {
				Name: "always",
			},
			PortBindings: {
				"9090/tcp": [
					{
						HostPort: "9090",
					},
				],
			},
			Binds: [
				"/etc/dokploy/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro",
				"/etc/dokploy/prometheus/data:/prometheus",
			],
			NetworkMode: "bridge",
		},
		ExposedPorts: {
			"9090/tcp": {},
		},
	};

	const docker = await getRemoteDocker(serverId);

	try {
		await pullRemoteImage(imageName, serverId);

		// Check if container exists
		const container = docker.getContainer(containerName);
		try {
			await container.inspect();
			await container.remove({ force: true });
			console.log("Removed existing Prometheus container");
		} catch {
			// Container doesn't exist, continue
		}

		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();

		console.log("Prometheus Started on remote server");
	} catch (error) {
		console.error("Failed to start Prometheus on remote server:", error);
		throw error;
	}
};

/**
 * Setup Node Exporter for system metrics
 */
export const setupNodeExporter = async (serverId?: string) => {
	if (serverId) {
		await setupRemoteNodeExporter(serverId);
	} else {
		await setupLocalNodeExporter();
	}
};

/**
 * Setup local Node Exporter
 */
const setupLocalNodeExporter = async () => {
	const containerName = "dokploy-node-exporter";
	const imageName = "prom/node-exporter:latest";

	const settings: ContainerCreateOptions = {
		name: containerName,
		Image: imageName,
		Cmd: [
			"--path.procfs=/host/proc",
			"--path.sysfs=/host/sys",
			"--path.rootfs=/rootfs",
			"--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)",
		],
		HostConfig: {
			RestartPolicy: {
				Name: "always",
			},
			PortBindings: {
				"9100/tcp": [
					{
						HostPort: "9100",
					},
				],
			},
			Binds: ["/proc:/host/proc:ro", "/sys:/host/sys:ro", "/:/rootfs:ro"],
			NetworkMode: "bridge",
		},
		ExposedPorts: {
			"9100/tcp": {},
		},
	};

	const docker = await getRemoteDocker();

	try {
		await pullImage(imageName);

		const container = docker.getContainer(containerName);
		try {
			await container.inspect();
			await container.remove({ force: true });
			console.log("Removed existing Node Exporter container");
		} catch {
			// Container doesn't exist, continue
		}

		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();

		console.log("Node Exporter Started");
	} catch (error) {
		console.error("Failed to start Node Exporter:", error);
		throw error;
	}
};

/**
 * Setup remote Node Exporter
 */
const setupRemoteNodeExporter = async (serverId: string) => {
	const containerName = "dokploy-node-exporter";
	const imageName = "prom/node-exporter:latest";

	const settings: ContainerCreateOptions = {
		name: containerName,
		Image: imageName,
		Cmd: [
			"--path.procfs=/host/proc",
			"--path.sysfs=/host/sys",
			"--path.rootfs=/rootfs",
			"--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)",
		],
		HostConfig: {
			RestartPolicy: {
				Name: "always",
			},
			PortBindings: {
				"9100/tcp": [
					{
						HostPort: "9100",
					},
				],
			},
			Binds: ["/proc:/host/proc:ro", "/sys:/host/sys:ro", "/:/rootfs:ro"],
			NetworkMode: "bridge",
		},
		ExposedPorts: {
			"9100/tcp": {},
		},
	};

	const docker = await getRemoteDocker(serverId);

	try {
		await pullRemoteImage(imageName, serverId);

		const container = docker.getContainer(containerName);
		try {
			await container.inspect();
			await container.remove({ force: true });
			console.log("Removed existing Node Exporter container");
		} catch {
			// Container doesn't exist, continue
		}

		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();

		console.log("Node Exporter Started on remote server");
	} catch (error) {
		console.error("Failed to start Node Exporter on remote server:", error);
		throw error;
	}
};

/**
 * Setup cAdvisor for container metrics
 */
export const setupCAdvisor = async (serverId?: string) => {
	if (serverId) {
		await setupRemoteCAdvisor(serverId);
	} else {
		await setupLocalCAdvisor();
	}
};

/**
 * Setup local cAdvisor
 */
const setupLocalCAdvisor = async () => {
	const containerName = "dokploy-cadvisor";
	const imageName = "gcr.io/cadvisor/cadvisor:latest";

	const settings: ContainerCreateOptions = {
		name: containerName,
		Image: imageName,
		HostConfig: {
			RestartPolicy: {
				Name: "always",
			},
			PortBindings: {
				"8080/tcp": [
					{
						HostPort: "8080",
					},
				],
			},
			Binds: [
				"/:/rootfs:ro",
				"/var/run:/var/run:ro",
				"/sys:/sys:ro",
				"/var/lib/docker/:/var/lib/docker:ro",
				"/dev/disk/:/dev/disk:ro",
			],
			Privileged: true,
			NetworkMode: "bridge",
		},
		ExposedPorts: {
			"8080/tcp": {},
		},
	};

	const docker = await getRemoteDocker();

	try {
		await pullImage(imageName);

		const container = docker.getContainer(containerName);
		try {
			await container.inspect();
			await container.remove({ force: true });
			console.log("Removed existing cAdvisor container");
		} catch {
			// Container doesn't exist, continue
		}

		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();

		console.log("cAdvisor Started");
	} catch (error) {
		console.error("Failed to start cAdvisor:", error);
		throw error;
	}
};

/**
 * Setup remote cAdvisor
 */
const setupRemoteCAdvisor = async (serverId: string) => {
	const containerName = "dokploy-cadvisor";
	const imageName = "gcr.io/cadvisor/cadvisor:latest";

	const settings: ContainerCreateOptions = {
		name: containerName,
		Image: imageName,
		HostConfig: {
			RestartPolicy: {
				Name: "always",
			},
			PortBindings: {
				"8080/tcp": [
					{
						HostPort: "8080",
					},
				],
			},
			Binds: [
				"/:/rootfs:ro",
				"/var/run:/var/run:ro",
				"/sys:/sys:ro",
				"/var/lib/docker/:/var/lib/docker:ro",
				"/dev/disk/:/dev/disk:ro",
			],
			Privileged: true,
			NetworkMode: "bridge",
		},
		ExposedPorts: {
			"8080/tcp": {},
		},
	};

	const docker = await getRemoteDocker(serverId);

	try {
		await pullRemoteImage(imageName, serverId);

		const container = docker.getContainer(containerName);
		try {
			await container.inspect();
			await container.remove({ force: true });
			console.log("Removed existing cAdvisor container");
		} catch {
			// Container doesn't exist, continue
		}

		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();

		console.log("cAdvisor Started on remote server");
	} catch (error) {
		console.error("Failed to start cAdvisor on remote server:", error);
		throw error;
	}
};

/**
 * Generate Prometheus configuration
 */
const generatePrometheusConfig = (): string => {
	return `
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node Exporter for system metrics
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  # cAdvisor for container metrics
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['localhost:8080']
`.trim();
};

/**
 * Setup complete Prometheus monitoring stack
 */
export const setupPrometheusStack = async (serverId?: string) => {
	console.log("Setting up Prometheus monitoring stack...");

	try {
		// Setup Prometheus server
		await setupPrometheus(serverId);

		// Setup Node Exporter
		await setupNodeExporter(serverId);

		// Setup cAdvisor
		await setupCAdvisor(serverId);

		console.log("Prometheus monitoring stack setup complete");
	} catch (error) {
		console.error("Failed to setup Prometheus monitoring stack:", error);
		throw error;
	}
};

/**
 * Stop and remove Prometheus monitoring stack
 */
export const stopPrometheusStack = async (serverId?: string) => {
	const containerNames = [
		"dokploy-prometheus",
		"dokploy-node-exporter",
		"dokploy-cadvisor",
	];

	const docker = serverId
		? await getRemoteDocker(serverId)
		: await getRemoteDocker();

	for (const containerName of containerNames) {
		try {
			const container = docker.getContainer(containerName);
			await container.inspect();
			await container.remove({ force: true });
			console.log(`Removed ${containerName}`);
		} catch {
			console.log(`Container ${containerName} not found`);
		}
	}
};
