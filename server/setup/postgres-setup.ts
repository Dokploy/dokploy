import { docker } from "../constants";
import { pullImage } from "../utils/docker/utils";
import type { CreateServiceOptions } from "dockerode";
export const initializePostgres = async () => {
	const imageName = "postgres:16";
	const containerName = "dokploy-postgres";
	const settings: CreateServiceOptions = {
		Name: containerName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Env: [
					"POSTGRES_USER=dokploy",
					"POSTGRES_DB=dokploy",
					"POSTGRES_PASSWORD=amukds4wi9001583845717ad2",
				],
				Mounts: [
					{
						Type: "volume",
						Source: "dokploy-postgres-database",
						Target: "/var/lib/postgresql/data",
					},
				],
			},
			Networks: [{ Target: "dokploy-network" }],
			RestartPolicy: {
				Condition: "on-failure",
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
					TargetPort: 5432,
					...(process.env.NODE_ENV === "development"
						? { PublishedPort: 5432 }
						: {}),
					Protocol: "tcp",
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

		console.log("Postgres Started ✅");
	} catch (error) {
		await docker.createService(settings);
		console.log("Postgres Not Found: Starting ✅");
	}
};
