// Custom backups are a constrained dump command, not a general-purpose shell.
// Connections and output destinations are supplied by Dokploy, never this text.
export const backupCommandExamples = {
	postgres: "pg_dump --no-acl --no-owner",
	mysql: "mysqldump --single-transaction --quick",
	mariadb: "mariadb-dump --single-transaction --quick",
	mongo: "mongodump",
};
export type CustomBackupEngine = keyof typeof backupCommandExamples;

const allowedOptions: Record<CustomBackupEngine, RegExp> = {
	postgres:
		/^--(?:no-acl|no-owner|no-comments|no-publications|no-subscriptions|schema-only|data-only|blobs|no-blobs|inserts|column-inserts|disable-dollar-quoting|verbose|strict-names|enable-row-security|quote-all-identifiers|load-via-partition-root)$|^--(?:exclude-table|exclude-table-data|exclude-schema|table|schema|encoding|lock-wait-timeout|rows-per-insert)=[^\r\n]+$/,
	mysql:
		/^--(?:single-transaction|quick|routines|events|triggers|skip-triggers|no-data|no-create-info|skip-comments|hex-blob|complete-insert|skip-extended-insert|skip-add-drop-table|add-drop-table|verbose)$|^--(?:ignore-table|default-character-set|set-gtid-purged|column-statistics|max-allowed-packet)=[^\r\n]+$/,
	mariadb:
		/^--(?:single-transaction|quick|routines|events|triggers|skip-triggers|no-data|no-create-info|skip-comments|hex-blob|complete-insert|skip-extended-insert|skip-add-drop-table|add-drop-table|verbose)$|^--(?:ignore-table|default-character-set|max-allowed-packet)=[^\r\n]+$/,
	mongo:
		/^--(?:verbose|quiet|forceTableScan)$|^--(?:collection|excludeCollection|excludeCollectionsWithPrefix|readPreference|numParallelCollections)=[^\r\n]+$/,
};

export const isAllowedBackupArgument = (
	engine: CustomBackupEngine,
	argument: string,
) => allowedOptions[engine].test(argument);

/** Intentionally small grammar: a command followed by literal, allowlisted flags.
 * No shell parsing, expansion, operators, redirects, SQL, or extra executables.
 */
export const parseBackupCommand = (
	script: string,
	engine: CustomBackupEngine,
): string[] => {
	if (/[\r\n\0;&|<>`$\\'"(){}]/.test(script)) {
		throw new Error(
			"Use one backup command. Shell operators, quotes, variables and multiple lines are not allowed.",
		);
	}
	const tokens = script.trim().split(/\s+/);
	const command = backupCommandExamples[engine].split(" ")[0];
	if (tokens.shift() !== command)
		throw new Error(
			`Use ${command} for this database. Set credentials in Connection settings.`,
		);
	if (
		tokens.length > 100 ||
		tokens.some((token) => !isAllowedBackupArgument(engine, token))
	) {
		throw new Error(
			"Unsupported backup option. Use only dump filters and format-preserving options; configure the connection in the fields above.",
		);
	}
	return tokens;
};
