import type { CreateServiceOptions, PortConfig } from "dockerode";
import { docker } from "../constants";
import { pullImage } from "../utils/docker/utils";

// Legacy hardcoded default kept only as a fallback for installs that haven't
// migrated to Docker secrets yet. The installer should always set
// POSTGRES_PASSWORD (or POSTGRES_PASSWORD_FILE) so the known default is never
// used against a network-reachable database.
const LEGACY_POSTGRES_PASSWORD = "amukds4wi9001583845717ad2";
const POSTGRES_PASSWORD =
	process.env.POSTGRES_PASSWORD ?? LEGACY_POSTGRES_PASSWORD;

export const initializePostgres = async () => {
	const imageName = "postgres:18";
	const containerName = "dokploy-postgres";
	const settings: CreateServiceOptions = {
		Name: containerName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Env: [
					"POSTGRES_USER=dokploy",
					"POSTGRES_DB=dokploy",
					`POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
					// Pin PGDATA to the historical, version-agnostic layout so an
					// existing volume is never abandoned when the image is upgraded
					// (pre-18 images kept data at /var/lib/postgresql/data).
					"PGDATA=/var/lib/postgresql/data",
				],
				Mounts: [
					{
						Type: "volume",
						Source: "dokploy-postgres",
						// Mount the parent directory: postgres 18+ stores data in a
						// version-specific subdirectory, but with PGDATA pinned above
						// initdb still writes to /var/lib/postgresql/data. Keeping the
						// parent as the mount point also lets major-version upgrades
						// run `pg_upgrade --link` without mount-boundary issues.
						Target: "/var/lib/postgresql",
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
		...(process.env.NODE_ENV === "development" && {
			EndpointSpec: {
				Ports: [
					{
						TargetPort: 5432,
						PublishedPort: 5432,
						Protocol: "tcp",
						PublishMode: "host",
						// Only expose the dev database on localhost so the known
						// legacy credential is never reachable from the network.
						HostIp: "127.0.0.1",
					} as PortConfig,
				],
			},
		}),
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
	} catch (_) {
		try {
			await docker.createService(settings);
		} catch (error: any) {
			if (error?.statusCode !== 409) {
				throw error;
			}
			console.log("Postgres service already exists, continuing...");
		}
		console.log("Postgres Not Found: Starting ✅");
	}
};
