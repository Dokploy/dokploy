import type { InferResultType } from "@dokploy/server/types/with";
import type { CreateServiceOptions } from "dockerode";
import {
	calculateResources,
	generateBindMounts,
	generateConfigContainer,
	generateFileMounts,
	generateVolumeMounts,
	prepareEnvironmentVariables,
} from "../docker/utils";
import { getRemoteDocker } from "../servers/remote-docker";

export type MongoNested = InferResultType<
	"mongo",
	{ mounts: true; project: true }
>;

export const buildMongo = async (mongo: MongoNested) => {
	const {
		appName,
		env,
		externalPort,
		dockerImage,
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
		databaseUser,
		databasePassword,
		command,
		mounts,
		replicaSets,
	} = mongo;

	const startupScript = `
#!/bin/bash
${
	replicaSets
		? `
mongod --port 27017 --replSet rs0 --bind_ip_all &
MONGOD_PID=$!

# Wait for MongoDB to be ready
while ! mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
	sleep 2
done

# Check if replica set is already initialized
REPLICA_STATUS=$(mongosh --quiet --eval "rs.status().ok || 0")

if [ "$REPLICA_STATUS" != "1" ]; then
	echo "Initializing replica set..."
	mongosh --eval '
	rs.initiate({
		_id: "rs0",
		members: [{ _id: 0, host: "localhost:27017", priority: 1 }]
	});

    // Wait for the replica set to initialize
	while (!rs.isMaster().ismaster) {
		sleep(1000);
	}

    // Create root user after replica set is initialized and we are primary
	db.getSiblingDB("admin").createUser({
		user: "${databaseUser}",
		pwd: "${databasePassword}",
		roles: ["root"]
	});
	'

else
	echo "Replica set already initialized."
fi
`
		: ""
}

${command ?? "wait $MONGOD_PID"}`;

	const defaultMongoEnv = `MONGO_INITDB_ROOT_USERNAME="${databaseUser}"\nMONGO_INITDB_ROOT_PASSWORD="${databasePassword}"${replicaSets ? "\nMONGO_INITDB_DATABASE=admin" : ""}${
		env ? `\n${env}` : ""
	}`;

	const {
		HealthCheck,
		RestartPolicy,
		Placement,
		Labels,
		Mode,
		RollbackConfig,
		UpdateConfig,
		Networks,
	} = generateConfigContainer(mongo);

	const resources = calculateResources({
		memoryLimit,
		memoryReservation,
		cpuLimit,
		cpuReservation,
	});

	const envVariables = prepareEnvironmentVariables(
		defaultMongoEnv,
		mongo.project.env,
	);
	const volumesMount = generateVolumeMounts(mounts);
	const bindsMount = generateBindMounts(mounts);
	const filesMount = generateFileMounts(appName, mongo);

	const docker = await getRemoteDocker(mongo.serverId);

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				HealthCheck,
				Image: dockerImage,
				Env: envVariables,
				Mounts: [...volumesMount, ...bindsMount, ...filesMount],
				...(replicaSets
					? {
							Command: ["/bin/bash"],
							Args: ["-c", startupScript],
						}
					: {
							...(command && {
								Command: ["/bin/bash"],
								Args: ["-c", command],
							}),
						}),
				Labels,
			},
			Networks,
			RestartPolicy,
			Placement,
			Resources: {
				...resources,
			},
		},
		Mode,
		RollbackConfig,
		EndpointSpec: {
			Mode: "dnsrr",
			Ports: externalPort
				? [
						{
							Protocol: "tcp",
							TargetPort: 27017,
							PublishedPort: externalPort,
							PublishMode: "host",
						},
					]
				: [],
		},
		UpdateConfig,
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
	} catch {
		await docker.createService(settings);
	}
};
