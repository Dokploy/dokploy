import { getEnviromentVariablesObject } from "@dokploy/server/index";
import { describe, expect, it } from "vitest";

const projectEnv = `
ENVIRONMENT=staging
DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_db
PORT=3000
`;

const environmentEnv = `
NODE_ENV=development
API_URL=https://api.dev.example.com
REDIS_URL=redis://localhost:6379
DATABASE_NAME=dev_database
SECRET_KEY=env-secret-123
`;

describe("getEnviromentVariablesObject with environment variables (Stack compose)", () => {
	it("resolves environment variables correctly for Stack compose", () => {
		const serviceEnv = `
FOO=\${{environment.NODE_ENV}}
BAR=\${{environment.API_URL}}
BAZ=test
`;

		const result = getEnviromentVariablesObject(
			serviceEnv,
			projectEnv,
			environmentEnv,
		);

		expect(result).toEqual({
			FOO: "development",
			BAR: "https://api.dev.example.com",
			BAZ: "test",
		});
	});

	it("resolves both project and environment variables for Stack compose", () => {
		const serviceEnv = `
ENVIRONMENT=\${{project.ENVIRONMENT}}
NODE_ENV=\${{environment.NODE_ENV}}
API_URL=\${{environment.API_URL}}
DATABASE_URL=\${{project.DATABASE_URL}}
SERVICE_PORT=4000
`;

		const result = getEnviromentVariablesObject(
			serviceEnv,
			projectEnv,
			environmentEnv,
		);

		expect(result).toEqual({
			ENVIRONMENT: "staging",
			NODE_ENV: "development",
			API_URL: "https://api.dev.example.com",
			DATABASE_URL: "postgres://postgres:postgres@localhost:5432/project_db",
			SERVICE_PORT: "4000",
		});
	});

	it("handles multiple environment references in single value for Stack compose", () => {
		const multiRefEnv = `
HOST=localhost
PORT=5432
USERNAME=postgres
PASSWORD=secret123
`;

		const serviceEnv = `
DATABASE_URL=postgresql://\${{environment.USERNAME}}:\${{environment.PASSWORD}}@\${{environment.HOST}}:\${{environment.PORT}}/mydb
`;

		const result = getEnviromentVariablesObject(serviceEnv, "", multiRefEnv);

		expect(result).toEqual({
			DATABASE_URL: "postgresql://postgres:secret123@localhost:5432/mydb",
		});
	});

	it("throws error for undefined environment variables in Stack compose", () => {
		const serviceWithUndefined = `
UNDEFINED_VAR=\${{environment.UNDEFINED_VAR}}
`;

		expect(() =>
			getEnviromentVariablesObject(serviceWithUndefined, "", environmentEnv),
		).toThrow("Invalid environment variable: environment.UNDEFINED_VAR");
	});

	it("allows service variables to override environment variables in Stack compose", () => {
		const serviceOverrideEnv = `
NODE_ENV=production
API_URL=\${{environment.API_URL}}
`;

		const result = getEnviromentVariablesObject(
			serviceOverrideEnv,
			"",
			environmentEnv,
		);

		expect(result).toEqual({
			NODE_ENV: "production",
			API_URL: "https://api.dev.example.com",
		});
	});

	it("resolves complex references with project, environment, and service variables for Stack compose", () => {
		const complexServiceEnv = `
FULL_DATABASE_URL=\${{project.DATABASE_URL}}/\${{environment.DATABASE_NAME}}
API_ENDPOINT=\${{environment.API_URL}}/\${{project.ENVIRONMENT}}/api
SERVICE_NAME=my-service
COMPLEX_VAR=\${{SERVICE_NAME}}-\${{environment.NODE_ENV}}-\${{project.ENVIRONMENT}}
`;

		const result = getEnviromentVariablesObject(
			complexServiceEnv,
			projectEnv,
			environmentEnv,
		);

		expect(result).toEqual({
			FULL_DATABASE_URL:
				"postgres://postgres:postgres@localhost:5432/project_db/dev_database",
			API_ENDPOINT: "https://api.dev.example.com/staging/api",
			SERVICE_NAME: "my-service",
			COMPLEX_VAR: "my-service-development-staging",
		});
	});

	it("maintains precedence: service > environment > project in Stack compose", () => {
		const conflictingProjectEnv = `
NODE_ENV=production-project
API_URL=https://project.api.com
DATABASE_NAME=project_db
`;

		const conflictingEnvironmentEnv = `
NODE_ENV=development-environment
API_URL=https://environment.api.com
DATABASE_NAME=env_db
`;

		const serviceWithConflicts = `
NODE_ENV=service-override
PROJECT_ENV=\${{project.NODE_ENV}}
ENV_VAR=\${{environment.API_URL}}
DB_NAME=\${{environment.DATABASE_NAME}}
`;

		const result = getEnviromentVariablesObject(
			serviceWithConflicts,
			conflictingProjectEnv,
			conflictingEnvironmentEnv,
		);

		expect(result).toEqual({
			NODE_ENV: "service-override",
			PROJECT_ENV: "production-project",
			ENV_VAR: "https://environment.api.com",
			DB_NAME: "env_db",
		});
	});

	it("handles empty environment variables in Stack compose", () => {
		const serviceWithEmpty = `
SERVICE_VAR=test
PROJECT_VAR=\${{project.ENVIRONMENT}}
`;

		const result = getEnviromentVariablesObject(
			serviceWithEmpty,
			projectEnv,
			"",
		);

		expect(result).toEqual({
			SERVICE_VAR: "test",
			PROJECT_VAR: "staging",
		});
	});
});
