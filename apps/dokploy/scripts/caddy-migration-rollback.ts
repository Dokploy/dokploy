import { pathToFileURL } from "node:url";
import type { CaddyMigrationReport } from "@dokploy/server";

interface RollbackArgs {
	migrationId: string;
	serverId?: string;
}

interface CliIo {
	stdout: Pick<typeof process.stdout, "write">;
	stderr: Pick<typeof process.stderr, "write">;
}

const usage =
	"Usage: caddy-migration-rollback --migration-id <id> [--server-id <id>]";

export const parseCaddyRollbackArgs = (argv: string[]): RollbackArgs => {
	let migrationId = "";
	let serverId: string | undefined;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--migration-id") {
			migrationId = argv[++index] ?? "";
		} else if (arg === "--server-id") {
			serverId = argv[++index] || undefined;
		} else if (arg === "--help" || arg === "-h") {
			throw new Error(usage);
		} else {
			throw new Error(`Unknown argument "${arg}". ${usage}`);
		}
	}
	if (!migrationId) {
		throw new Error(`Missing --migration-id. ${usage}`);
	}
	return { migrationId, serverId };
};

const isHelpRequest = (argv: string[]) =>
	argv.some((arg) => arg === "--help" || arg === "-h");

const buildOutput = (report: CaddyMigrationReport) => ({
	migrationId: report.migrationId,
	status: report.status,
	providerTarget: "traefik",
	warnings: report.warnings,
	summary: report.summary,
	reportPath: report.artifactPaths.reportJson,
});

export const runCaddyMigrationRollbackCli = async (
	argv = process.argv.slice(2),
	io: CliIo = process,
) => {
	if (isHelpRequest(argv)) {
		io.stdout.write(`${usage}\n`);
		return 0;
	}

	try {
		const args = parseCaddyRollbackArgs(argv);
		const { rollbackCaddyMigration } = await import("@dokploy/server");
		const report = await rollbackCaddyMigration(args);
		const output = buildOutput(report);
		io.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
		return report.status === "rolled_back" ? 0 : 1;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Rollback failed";
		io.stderr.write(`${message}\n`);
		io.stdout.write(
			`${JSON.stringify(
				{
					status: "failed",
					providerTarget: "traefik",
					error: message,
				},
				null,
				2,
			)}\n`,
		);
		return 1;
	}
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const code = await runCaddyMigrationRollbackCli();
	process.exit(code);
}
