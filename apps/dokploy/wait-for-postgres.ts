import net from "node:net";
import { URL } from "node:url";
import { dbUrl } from "@dokploy/server/db/constants";

const TIMEOUT_MS = Number(process.env.POSTGRES_WAIT_TIMEOUT || 120_000);
const RETRY_DELAY_MS = Number(process.env.POSTGRES_WAIT_RETRY || 2000);

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePostgresTarget(): { host: string; port: number } {
	const databaseUrl = dbUrl;

	if (!databaseUrl) {
		console.error("[wait-for-postgres] DATABASE_URL is not set");
		process.exit(1);
	}

	try {
		const url = new URL(databaseUrl);

		const host = url.hostname;
		const port = Number(url.port || 5432);

		if (!host) {
			throw new Error("DATABASE_URL has no hostname");
		}

		return { host, port };
	} catch (err) {
		console.error("[wait-for-postgres] Invalid DATABASE_URL:", databaseUrl);
		process.exit(1);
	}
}

function checkTcpConnection(host: string, port: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ host, port });

		socket.setTimeout(3000);

		socket.on("connect", () => {
			socket.end();
			resolve();
		});

		socket.on("timeout", () => {
			socket.destroy();
			reject(new Error("Connection timeout"));
		});

		socket.on("error", reject);
	});
}

async function waitForPostgres() {
	const { host, port } = resolvePostgresTarget();
	const start = Date.now();

	console.log(
		`[wait-for-postgres] Waiting for postgres at ${host}:${port} (timeout ${TIMEOUT_MS}ms)`,
	);

	while (true) {
		try {
			await checkTcpConnection(host, port);
			console.log("[wait-for-postgres] Postgres is reachable ✅");
			return;
		} catch {
			const elapsed = Date.now() - start;

			if (elapsed > TIMEOUT_MS) {
				console.error(
					`[wait-for-postgres] Timeout after ${elapsed}ms. Postgres not reachable ❌`,
				);
				process.exit(1);
			}

			console.log(
				`[wait-for-postgres] Postgres not ready yet, retrying in ${RETRY_DELAY_MS}ms...`,
			);
			await sleep(RETRY_DELAY_MS);
		}
	}
}

waitForPostgres().catch((err) => {
	console.error("[wait-for-postgres] Fatal error:", err);
	process.exit(1);
});
