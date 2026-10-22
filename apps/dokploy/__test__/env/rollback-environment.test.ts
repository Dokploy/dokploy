import { prepareEnvironmentVariables } from "@dokploy/server/index";
import { describe, expect, it } from "vitest";

const projectEnv = `
ENVIRONMENT=staging
DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_db
`;

const environmentEnv = `
NODE_ENV=production
POSTGRES_HOST=postgres.internal
POSTGRES_PORT=5432
REDIS_URL=redis://redis.internal:6379
`;

const serviceEnv = `
NODE_ENV=\${{environment.NODE_ENV}}
REDIS_URL=\${{environment.REDIS_URL}}
PORT=3000
`;

/**
 * A rollback replays the snapshot stored in `rollbacks.fullContext`, which keeps
 * the service env, the environment env and the project env captured at deploy time.
 */
const fullContext = {
	env: serviceEnv,
	environment: {
		env: environmentEnv,
		project: {
			env: projectEnv,
		},
	},
};

describe("prepareEnvironmentVariables for application rollback", () => {
	it("resolves environment variables from the rollback snapshot", () => {
		const result = prepareEnvironmentVariables(
			fullContext.env,
			fullContext.environment.project.env,
			fullContext.environment.env,
		);

		expect(result).toEqual([
			"NODE_ENV=production",
			"REDIS_URL=redis://redis.internal:6379",
			"PORT=3000",
		]);
	});

	it("resolves project and environment variables together on rollback", () => {
		const rollbackEnv = `
DATABASE_URL=\${{project.DATABASE_URL}}
POSTGRES_URL=postgres://\${{environment.POSTGRES_HOST}}:\${{environment.POSTGRES_PORT}}/app
ENVIRONMENT=\${{project.ENVIRONMENT}}
`;

		const result = prepareEnvironmentVariables(
			rollbackEnv,
			projectEnv,
			environmentEnv,
		);

		expect(result).toEqual([
			"DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_db",
			"POSTGRES_URL=postgres://postgres.internal:5432/app",
			"ENVIRONMENT=staging",
		]);
	});

	it("throws when the environment env of the snapshot is not passed", () => {
		expect(() =>
			prepareEnvironmentVariables(fullContext.env, projectEnv),
		).toThrow("Invalid environment variable: environment.NODE_ENV");
	});

	it("maintains precedence: service > environment > project on rollback", () => {
		const conflictingProjectEnv = `
NODE_ENV=project
API_URL=https://project.api.com
`;

		const conflictingEnvironmentEnv = `
NODE_ENV=environment
API_URL=https://environment.api.com
`;

		const rollbackEnv = `
NODE_ENV=service
PROJECT_API_URL=\${{project.API_URL}}
ENVIRONMENT_API_URL=\${{environment.API_URL}}
SELF_REFERENCE=\${{NODE_ENV}}
`;

		const result = prepareEnvironmentVariables(
			rollbackEnv,
			conflictingProjectEnv,
			conflictingEnvironmentEnv,
		);

		expect(result).toEqual([
			"NODE_ENV=service",
			"PROJECT_API_URL=https://project.api.com",
			"ENVIRONMENT_API_URL=https://environment.api.com",
			"SELF_REFERENCE=service",
		]);
	});
});
