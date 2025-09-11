import type { CreateServiceOptions } from "dockerode";
import { docker } from "../constants";
import { execAsync } from "../utils/process/execAsync";

export interface SimpleRegistryConfig {
	username: string;
	password: string;
	domain: string;
	registryName?: string;
}

export const initializeDefaultRegistry = async () => {
	// Create a default self-hosted registry with standard settings
	const defaultConfig: SimpleRegistryConfig = {
		username: "registry",
		password: "registry123",
		domain: "registry.localhost",
		registryName: "Default Self Hosted Registry",
	};

	return await initializeSimpleRegistry(defaultConfig);
};

export const initializeDefaultRegistryWithDatabase = async (
	organizationId: string,
) => {
	// First initialize the Docker service
	await initializeDefaultRegistry();

	// Then create the database entry
	const { createDefaultRegistry } = await import("../services/registry");
	return await createDefaultRegistry(organizationId);
};

export const initializeSimpleRegistry = async (
	config: SimpleRegistryConfig,
) => {
	const containerName = "dokploy-registry";
	const registryPort = 5001; // Changed from 5000 to avoid macOS AirPlay conflict

	// Handle localhost domains
	const isLocalhost = config.domain.includes("localhost");

	// Create a simple registry configuration
	const registryConfig = {
		version: "0.1",
		storage: {
			filesystem: {
				rootdirectory: "/var/lib/registry",
			},
		},
		http: {
			addr: ":5001",
			...(isLocalhost
				? {}
				: {
						tls: {
							certificate: "/certs/domain.crt",
							key: "/certs/domain.key",
						},
					}),
		},
		auth: {
			htpasswd: {
				realm: "Registry Realm",
				path: "/auth/htpasswd",
			},
		},
	};

	const settings: CreateServiceOptions = {
		Name: containerName,
		TaskTemplate: {
			ContainerSpec: {
				Image: "registry:2",
				Env: [
					"REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY=/var/lib/registry",
					"REGISTRY_HTTP_ADDR=0.0.0.0:5001",
					"REGISTRY_AUTH=htpasswd",
					"REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm",
					"REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd",
					...(isLocalhost
						? []
						: [
								"REGISTRY_HTTP_TLS_CERTIFICATE=/certs/domain.crt",
								"REGISTRY_HTTP_TLS_KEY=/certs/domain.key",
							]),
				],
				Mounts: [
					{
						Type: "volume" as const,
						Source: "dokploy-registry-data",
						Target: "/var/lib/registry",
					},
					{
						Type: "volume" as const,
						Source: "dokploy-registry-auth",
						Target: "/auth",
					},
					...(isLocalhost
						? []
						: [
								{
									Type: "volume" as const,
									Source: "dokploy-registry-certs",
									Target: "/certs",
								},
							]),
				],
				Command: [
					"sh",
					"-c",
					`echo '${config.username}:${await generateSimpleHtpasswd(config.password)}' > /auth/htpasswd && registry serve /etc/docker/registry/config.yml`,
				],
			},
			Networks: [{ Target: "dokploy-network" }],
			Placement: {
				Constraints: ["node.role==manager"],
			},
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
		EndpointSpec: {
			Ports: [
				{
					TargetPort: registryPort,
					PublishedPort: registryPort,
					Protocol: "tcp",
					PublishMode: "host",
				},
			],
		},
	};

	try {
		// Create necessary volumes
		await createSimpleVolumes(isLocalhost);

		// Generate SSL certificates for the domain (skip for localhost)
		if (!isLocalhost) {
			await generateSSLCertificates(config.domain);
		}

		// Check if service already exists
		const service = docker.getService(containerName);
		try {
			const inspect = await service.inspect();
			await service.update({
				version: Number.parseInt(inspect.Version.Index),
				...settings,
			});
			console.log("Simple Registry Updated ✅");
		} catch (_) {
			// Service doesn't exist, create it
			await docker.createService(settings);
			console.log("Simple Registry Started ✅");
		}

		// Configure Traefik for the registry (skip for localhost)
		if (!isLocalhost) {
			await configureTraefikForRegistry(config.domain, registryPort);
		}

		return {
			registryUrl: isLocalhost
				? `http://localhost:${registryPort}`
				: `https://${config.domain}`,
			username: config.username,
			password: config.password,
			registryName: config.registryName || "Self Hosted Registry",
		};
	} catch (error) {
		console.error("Error setting up simple registry:", error);
		throw error;
	}
};

const createSimpleVolumes = async (isLocalhost = false) => {
	const volumes = ["dokploy-registry-data", "dokploy-registry-auth"];

	// Only add certs volume for non-localhost setups
	if (!isLocalhost) {
		volumes.push("dokploy-registry-certs");
	}

	for (const volumeName of volumes) {
		try {
			await execAsync(`docker volume create ${volumeName}`);
		} catch (error) {
			// Volume might already exist, continue
			console.log(`Volume ${volumeName} might already exist`);
		}
	}
};

const generateSimpleHtpasswd = async (password: string): Promise<string> => {
	// Generate proper htpasswd hash
	try {
		const result = await execAsync(`htpasswd -Bbn registry ${password}`);
		return result.stdout.trim();
	} catch (error) {
		// Fallback: create a simple bcrypt hash using openssl
		console.warn("htpasswd not available, using openssl fallback");
		try {
			// Generate a simple bcrypt hash using openssl
			const salt = await execAsync(`openssl rand -base64 16 | tr -d '\n'`);
			const hash = await execAsync(
				`openssl passwd -6 -salt ${salt.stdout.trim()} ${password}`,
			);
			return hash.stdout.trim();
		} catch (fallbackError) {
			// Last resort: use plain text (not recommended for production)
			console.warn(
				"Using plain text password - not recommended for production",
			);
			return password;
		}
	}
};

const generateSSLCertificates = async (domain: string) => {
	try {
		// Create self-signed certificate for the registry
		const certPath = "/etc/dokploy/registry/certs";
		await execAsync(`mkdir -p ${certPath}`);

		await execAsync(
			`openssl req -newkey rsa:4096 -nodes -keyout ${certPath}/domain.key -x509 -days 365 -out ${certPath}/domain.crt -subj "/C=US/ST=State/L=City/O=Organization/CN=${domain}"`,
		);

		// Copy certificates to Docker volume
		await execAsync(
			`docker run --rm -v dokploy-registry-certs:/certs -v ${certPath}:/source alpine sh -c "cp /source/* /certs/"`,
		);

		console.log("SSL certificates generated for registry");
	} catch (error) {
		console.error("Error generating SSL certificates:", error);
		throw error;
	}
};

const configureTraefikForRegistry = async (domain: string, port: number) => {
	try {
		// Create Traefik configuration for registry
		const traefikConfig = `
[http.routers.registry]
  rule = "Host(\`${domain}\`)"
  service = "registry"
  tls = true

[http.services.registry]
  [http.services.registry.loadBalancer]
    [[http.services.registry.loadBalancer.servers]]
      url = "http://localhost:${port}"

[tls.certificates]
  [tls.certificates[0]]
    certFile = "/etc/dokploy/registry/certs/domain.crt"
    keyFile = "/etc/dokploy/registry/certs/domain.key"
`;

		await execAsync(`mkdir -p /etc/dokploy/traefik/dynamic`);
		await execAsync(
			`echo '${traefikConfig}' > /etc/dokploy/traefik/dynamic/registry.yml`,
		);

		console.log("Traefik configured for registry");
	} catch (error) {
		console.error("Error configuring Traefik for registry:", error);
		throw error;
	}
};
