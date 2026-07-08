import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

const restoreEnv = () => {
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnv)) {
			delete process.env[key];
		}
	}
	Object.assign(process.env, originalEnv);
};

const loadDbConstants = async (env: Record<string, string | undefined>) => {
	vi.resetModules();
	restoreEnv();
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	return import("@dokploy/server/db/constants");
};

describe("postgres credential configuration boundary", () => {
	afterEach(() => {
		vi.resetModules();
		restoreEnv();
	});

	it("requires an explicit production Postgres password source when DATABASE_URL is absent", async () => {
		await expect(
			loadDbConstants({
				NODE_ENV: "production",
				DATABASE_URL: undefined,
				POSTGRES_PASSWORD: undefined,
				POSTGRES_PASSWORD_FILE: undefined,
			}),
		).rejects.toThrow(/POSTGRES_PASSWORD_FILE or POSTGRES_PASSWORD/);
	});

	it("builds the production Postgres URL from POSTGRES_PASSWORD without the legacy credential", async () => {
		const { dbUrl } = await loadDbConstants({
			NODE_ENV: "production",
			DATABASE_URL: undefined,
			POSTGRES_PASSWORD: "new password/with symbols",
			POSTGRES_PASSWORD_FILE: undefined,
			POSTGRES_HOST: "dokploy-postgres",
			POSTGRES_PORT: "5432",
		});

		expect(dbUrl).toBe(
			"postgres://dokploy:new%20password%2Fwith%20symbols@dokploy-postgres:5432/dokploy",
		);
	});

	it("allows Next production build imports without a runtime Postgres password", async () => {
		const { dbUrl } = await loadDbConstants({
			NODE_ENV: "production",
			NEXT_PHASE: "phase-production-build",
			DATABASE_URL: undefined,
			POSTGRES_PASSWORD: undefined,
			POSTGRES_PASSWORD_FILE: undefined,
			POSTGRES_HOST: "dokploy-postgres",
			POSTGRES_PORT: "5432",
		});

		expect(dbUrl).toBe(
			"postgres://dokploy:dokploy@dokploy-postgres:5432/dokploy",
		);
	});

	it("can reuse an explicit DATABASE_URL password for bundled Postgres setup", async () => {
		const { resolvePostgresPassword } = await loadDbConstants({
			NODE_ENV: "production",
			DATABASE_URL: "postgres://dokploy:url%20password@localhost:5432/dokploy",
			POSTGRES_PASSWORD: undefined,
			POSTGRES_PASSWORD_FILE: undefined,
		});

		expect(resolvePostgresPassword({ allowDatabaseUrl: true })).toBe(
			"url password",
		);
	});

	it("keeps the local development fallback on localhost when no explicit host is set", async () => {
		const { dbUrl } = await loadDbConstants({
			NODE_ENV: "development",
			DATABASE_URL: undefined,
			POSTGRES_PASSWORD: undefined,
			POSTGRES_PASSWORD_FILE: undefined,
			POSTGRES_HOST: undefined,
		});

		expect(dbUrl).toBe("postgres://dokploy:dokploy@localhost:5432/dokploy");
	});
});
