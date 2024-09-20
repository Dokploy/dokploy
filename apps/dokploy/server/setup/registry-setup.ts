import type { CreateServiceOptions } from "dockerode";
import { generateRandomPassword } from "../auth/random-password";
import { docker, paths } from "../constants";
import { pullImage } from "../utils/docker/utils";
import { execAsync } from "../utils/process/execAsync";

export const initializeRegistry = async (
	username: string,
	password: string,
) => {
	const { REGISTRY_PATH } = paths();
	const imageName = "registry:2.8.3";
	const containerName = "dokploy-registry";
	await generateRegistryPassword(username, password);
	const randomPass = await generateRandomPassword();
	const settings: CreateServiceOptions = {
		Name: containerName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Env: [
					"REGISTRY_STORAGE_DELETE_ENABLED=true",
					"REGISTRY_AUTH=htpasswd",
					"REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm",
					"REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd",
					`REGISTRY_HTTP_SECRET=${randomPass.hashedPassword}`,
				],
				Mounts: [
					{
						Type: "bind",
						Source: `${REGISTRY_PATH}/htpasswd`,
						Target: "/auth/htpasswd",
						ReadOnly: true,
					},
					{
						Type: "volume",
						Source: "registry-data",
						Target: "/var/lib/registry",
						ReadOnly: false,
					},
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
					TargetPort: 5000,
					PublishedPort: 5000,
					Protocol: "tcp",
					PublishMode: "host",
				},
			],
		},
	};
	try {
		await pullImage(imageName);

		const service = docker.getService(containerName);
		const inspect = await service.inspect();
		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
		});
		console.log("Registry Started ✅");
	} catch (error) {
		await docker.createService(settings);
		console.log("Registry Not Found: Starting ✅");
	}
};

const generateRegistryPassword = async (username: string, password: string) => {
	try {
		const { REGISTRY_PATH } = paths();
		const command = `htpasswd -nbB ${username} "${password}" > ${REGISTRY_PATH}/htpasswd`;
		const result = await execAsync(command);
		console.log("Password generated ✅");
		return result.stdout.trim();
	} catch (error) {
		console.error("Error generating password:", error);
		return null;
	}
};
