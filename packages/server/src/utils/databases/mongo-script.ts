export interface GenerateMongoStartupScriptOptions {
	appName: string;
	databaseUser: string;
	databasePassword: string;
	command?: string | null;
	replicaSets?: boolean | null;
}

export const generateMongoStartupScript = ({
	appName,
	databaseUser,
	databasePassword,
	command,
	replicaSets,
}: GenerateMongoStartupScriptOptions): string => {
	if (!replicaSets) {
		return "";
	}

	const waitCommand = command?.trim() ? command.trim() : "wait $MONGOD_PID";

	return `#!/bin/bash
mongod --port 27017 --replSet rs0 --bind_ip_all &
MONGOD_PID=$!
trap 'kill -TERM $MONGOD_PID 2>/dev/null; wait $MONGOD_PID' TERM INT

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
		members: [{ _id: 0, host: "${appName}:27017", priority: 1 }]
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

${waitCommand}`;
};
