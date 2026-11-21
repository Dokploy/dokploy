import {
	type CustomBackupEngine,
	parseBackupCommand,
} from "@dokploy/server/db/schema/backup-command";
import {
	type BackupMetadata,
	backupMetadataSchema,
} from "@dokploy/server/db/schema/backup-metadata";
import { quote } from "shell-quote";

export interface ComposeBackupInput {
	database: string;
	databaseType: string;
	serviceName?: string | null;
	metadata?: BackupMetadata | null;
}

export const isCustomBackup = (backup: { metadata?: BackupMetadata | null }) =>
	backup.metadata?.backupMode === "custom";

const getBackupEngine = (backup: ComposeBackupInput): CustomBackupEngine => {
	const engine = backup.databaseType;
	if (
		engine === "postgres" ||
		engine === "mysql" ||
		engine === "mariadb" ||
		engine === "mongo"
	)
		return engine;
	throw new Error("Select a supported database type");
};

// Legacy images already need bash for backups, but may not include timeout.
// Keep the probe bounded in that case and reap its process before returning.
const readinessWrapper = `if command -v timeout >/dev/null 2>&1; then
  exec timeout -k 2 10 "$@"
fi
"$@" &
probe_pid=$!
trap 'kill -KILL "$probe_pid" 2>/dev/null || true; wait "$probe_pid" 2>/dev/null || true' EXIT
trap 'exit 124' HUP INT TERM
deadline=$((SECONDS + 10))
while kill -0 "$probe_pid" 2>/dev/null; do
  if [ "$SECONDS" -ge "$deadline" ]; then exit 124; fi
  sleep 0.1 || exit 1
done
wait "$probe_pid"
status=$?
trap - EXIT
exit "$status"`;

/** Only opt into the new builder when an override is configured. */
export const hasComposeBackupOptions = (backup: ComposeBackupInput) => {
	if (isCustomBackup(backup)) return true;
	const type = backup.databaseType;
	if (
		type !== "postgres" &&
		type !== "mysql" &&
		type !== "mariadb" &&
		type !== "mongo"
	)
		return false;
	const connection = backup.metadata?.[type];
	// New configurations may rely entirely on the displayed defaults.
	if (!connection) return true;
	return Boolean(
		connection.databaseHost ||
			connection.databasePort !== undefined ||
			connection.additionalArgs?.length ||
			(type === "postgres" &&
				(connection.databasePassword !== undefined ||
					backup.metadata?.postgres?.connectionUri)) ||
			(type === "mysql" &&
				(connection.databaseUser ||
					connection.databasePassword !== undefined)) ||
			(type === "mongo" &&
				(backup.metadata?.mongo?.connectionUri ||
					backup.metadata?.mongo?.authenticationDatabase)),
	);
};

/** One argv builder for connection overrides, custom saves and scheduled runs. */
const getDumpCommand = (
	backup: ComposeBackupInput,
	custom: boolean,
	timeoutSeconds = 3600,
	readiness = false,
) => {
	const engine = getBackupEngine(backup);
	const metadata = backupMetadataSchema.parse(backup.metadata ?? {});
	const connection = metadata[engine] ?? {};
	const args = readiness
		? []
		: custom
			? parseBackupCommand(metadata.custom?.script ?? "", engine)
			: (connection.additionalArgs ?? []);
	const password =
		connection.databasePassword ??
		(engine === "mysql" ? metadata.mysql?.databaseRootPassword : undefined);
	// Custom commands must test the supplied credentials, without inherited files.
	// Default backups retain the container's existing client configuration.
	const env: Record<string, string> = custom ? { HOME: "/tmp" } : {};
	let tool: string;
	let commandArgs: string[];
	switch (engine) {
		case "postgres": {
			tool = "pg_dump";
			const uri = metadata.postgres?.connectionUri;
			if (custom) {
				env.PGPASSWORD = uri ? "" : (password ?? "");
				env.PGPASSFILE = "/dev/null";
			} else if (!uri && password !== undefined) {
				env.PGPASSWORD = password;
			}
			commandArgs = [
				"-Fc",
				"--no-password",
				...(readiness
					? ["--schema-only", "--exclude-schema=*"]
					: custom
						? []
						: ["--no-acl", "--no-owner"]),
				...args,
				...(uri
					? [`--dbname=${uri}`]
					: [
							`--host=${connection.databaseHost || "localhost"}`,
							...(custom || connection.databasePort !== undefined
								? [`--port=${connection.databasePort ?? 5432}`]
								: []),
							`--username=${connection.databaseUser ?? "postgres"}`,
							`--dbname=${backup.database}`,
						]),
			];
			break;
		}
		case "mysql":
		case "mariadb":
			tool = engine === "mysql" ? "mysqldump" : "mariadb-dump";
			commandArgs = [
				...(custom ? ["--no-defaults"] : []),
				...(engine === "mysql"
					? ["--default-character-set=utf8mb4", "--no-tablespaces"]
					: []),
				// Keep socket defaults unless an endpoint is overridden. Custom saves
				// use explicit TCP credentials so the test cannot use socket auth.
				...(custom || connection.databaseHost || connection.databasePort
					? [
							"--protocol=TCP",
							`--host=${connection.databaseHost || "127.0.0.1"}`,
							...(custom || connection.databasePort !== undefined
								? [`--port=${connection.databasePort ?? 3306}`]
								: []),
						]
					: []),
				`--user=${connection.databaseUser ?? "root"}`,
				`--password=${password ?? ""}`,
				...(readiness
					? [
							"--no-data",
							"--no-create-info",
							"--skip-triggers",
							"--skip-routines",
							"--skip-events",
							"--skip-lock-tables",
							"--no-tablespaces",
						]
					: custom
						? []
						: ["--single-transaction", "--quick"]),
				...args,
				...(engine === "mariadb" ? ["--databases"] : []),
				"--",
				backup.database,
			];
			break;
		case "mongo": {
			tool = "mongodump";
			const uri = metadata.mongo?.connectionUri;
			const probeOptions = readiness
				? custom
					? parseBackupCommand(metadata.custom?.script ?? "", engine)
					: (connection.additionalArgs ?? [])
				: [];
			const probeCollection = probeOptions.find((option) =>
				option.startsWith("--collection="),
			);
			commandArgs = [
				"--archive",
				// An impossible match checks the configured connection without reading documents.
				...(readiness
					? [
							probeCollection ?? "--collection=__dokploy_readiness__",
							...probeOptions.filter((option) =>
								option.startsWith("--readPreference="),
							),
							'--query={"$expr":{"$eq":[1,0]}}',
						]
					: []),
				...(custom ? [] : ["--gzip"]),
				`--db=${backup.database}`,
				...(uri
					? [`--uri=${uri}`]
					: [
							...(custom || connection.databaseHost
								? [`--host=${connection.databaseHost || "localhost"}`]
								: []),
							...(custom || connection.databasePort !== undefined
								? [`--port=${connection.databasePort ?? 27017}`]
								: []),
							...(connection.databaseUser
								? [
										`--username=${connection.databaseUser}`,
										`--password=${password ?? ""}`,
									]
								: []),
							`--authenticationDatabase=${metadata.mongo?.authenticationDatabase || "admin"}`,
						]),
				...args,
			];
			break;
		}
	}
	// Match the existing pipeline. No user shell or additional service is started.
	const dockerArgs = [
		"docker",
		"exec",
		...Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
		"-i",
	];
	return `${quote(dockerArgs)} "$CONTAINER_ID" ${quote([
		...(custom
			? ["timeout", "-k", readiness ? "2" : "10", String(timeoutSeconds)]
			: readiness
				? ["bash", "-c", readinessWrapper, "backup-readiness"]
				: []),
		tool,
		...commandArgs,
	])}`;
};

export const getCustomBackupCommand = (
	backup: ComposeBackupInput,
	timeoutSeconds = 3600,
) => getDumpCommand(backup, true, timeoutSeconds);

export const getComposeBackupCommand = (backup: ComposeBackupInput) => {
	const custom = isCustomBackup(backup);
	const command = getDumpCommand(backup, custom);
	return backup.databaseType === "mongo" && !custom
		? command
		: `${command} | gzip`;
};

/** Uses the existing dump tools and connection rules, without reading table data or uploading. */
export const getDatabaseReadinessCommand = (backup: ComposeBackupInput) =>
	getDumpCommand(backup, isCustomBackup(backup), 10, true);
