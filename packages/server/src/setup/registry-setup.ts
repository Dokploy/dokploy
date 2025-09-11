import type { CreateServiceOptions } from "dockerode";
import { docker } from "../constants";
import { pullImage } from "../utils/docker/utils";
import { execAsync } from "../utils/process/execAsync";

export interface SelfHostedRegistryConfig {
	username: string;
	password: string;
	domain: string;
	registryName?: string;
}

export const initializeSelfHostedRegistry = async (
	config: SelfHostedRegistryConfig,
) => {
	const imageName = "registry:2.8";
	const containerName = "dokploy-registry";
	const registryPort = 5000;

	// Handle localhost domains
	const isLocalhost = config.domain.includes("localhost");
	const registryHost = isLocalhost ? "localhost" : config.domain;

	// Generate basic auth credentials
	const authString = Buffer.from(
		`${config.username}:${config.password}`,
	).toString("base64");

	const settings: CreateServiceOptions = {
		Name: containerName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Env: [
					"REGISTRY_AUTH=htpasswd",
					`REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm`,
					`REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd`,
					"REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY=/var/lib/registry",
					...(isLocalhost
						? []
						: [
								"REGISTRY_HTTP_TLS_CERTIFICATE=/certs/domain.crt",
								"REGISTRY_HTTP_TLS_KEY=/certs/domain.key",
								"REGISTRY_HTTP_HOST=https://" + config.domain,
							]),
					"REGISTRY_HTTP_ADDR=0.0.0.0:5000",
				],
				Mounts: [
					{
						Type: "volume",
						Source: "dokploy-registry-data",
						Target: "/var/lib/registry",
					},
					{
						Type: "volume",
						Source: "dokploy-registry-auth",
						Target: "/auth",
					},
					...(isLocalhost
						? []
						: [
								{
									Type: "volume",
									Source: "dokploy-registry-certs",
									Target: "/certs",
								},
							]),
				],
				Command: [
					"sh",
					"-c",
					`echo '${config.username}:${await generateHtpasswd(config.password)}' > /auth/htpasswd && registry serve /etc/docker/registry/config.yml`,
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
		await createRegistryVolumes(isLocalhost);

		// Generate SSL certificates for the domain (skip for localhost)
		if (!isLocalhost) {
			await generateSSLCertificates(config.domain);
		}

		// Try to pull registry image, but don't fail if it's not available
		// The Docker service will pull it automatically when needed
		try {
			await pullImage(imageName);
			console.log(`Successfully pulled ${imageName}`);
		} catch (error) {
			console.warn(
				`Could not pull ${imageName}, Docker will pull it when the service starts:`,
				error,
			);
			// Don't throw error, let Docker handle the image pull
		}

		// Check if service already exists
		const service = docker.getService(containerName);
		try {
			const inspect = await service.inspect();
			await service.update({
				version: Number.parseInt(inspect.Version.Index),
				...settings,
			});
			console.log("Self-hosted Registry Updated ✅");
		} catch (_) {
			// Service doesn't exist, create it
			await docker.createService(settings);
			console.log("Self-hosted Registry Started ✅");
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
			registryName: config.registryName || "Self-Hosted Registry",
		};
	} catch (error) {
		console.error("Error setting up self-hosted registry:", error);
		throw error;
	}
};

const createRegistryVolumes = async (isLocalhost = false) => {
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

const generateHtpasswd = async (password: string): Promise<string> => {
	// Use htpasswd to generate password hash
	try {
		const result = await execAsync(`htpasswd -Bbn registry ${password}`);
		return result.trim();
	} catch (error) {
		// Fallback to basic auth if htpasswd is not available
		console.warn("htpasswd not available, using basic auth");
		return password;
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

export const removeSelfHostedRegistry = async () => {
	try {
		const containerName = "dokploy-registry";
		const service = docker.getService(containerName);
		await service.remove();

		// Remove volumes
		await execAsync(
			`docker volume rm dokploy-registry-data dokploy-registry-certs dokploy-registry-auth`,
		);

		// Remove Traefik configuration
		await execAsync(`rm -f /etc/dokploy/traefik/dynamic/registry.yml`);

		console.log("Self-hosted Registry Removed ✅");
	} catch (error) {
		console.error("Error removing self-hosted registry:", error);
		throw error;
	}
};
