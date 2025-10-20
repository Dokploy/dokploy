import { prepareEnvironmentVariables } from "@woap/server/index";
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

describe("prepareEnvironmentVariables (environment variables)", () => {
	it("resolves environment variables correctly", () => {
		const serviceWithEnvVars = `
NODE_ENV=\${{environment.NODE_ENV}}
API_URL=\${{environment.API_URL}}
SERVICE_PORT=4000
`;

		const resolved = prepareEnvironmentVariables(
			serviceWithEnvVars,
			"",
			environmentEnv,
		);

		expect(resolved).toEqual([
			"NODE_ENV=development",
			"API_URL=https://api.dev.example.com",
			"SERVICE_PORT=4000",
		]);
	});

	it("resolves both project and environment variables", () => {
		const serviceWithBoth = `
ENVIRONMENT=\${{project.ENVIRONMENT}}
NODE_ENV=\${{environment.NODE_ENV}}
API_URL=\${{environment.API_URL}}
DATABASE_URL=\${{project.DATABASE_URL}}
SERVICE_PORT=4000
`;

		const resolved = prepareEnvironmentVariables(
			serviceWithBoth,
			projectEnv,
			environmentEnv,
		);

		expect(resolved).toEqual([
			"ENVIRONMENT=staging",
			"NODE_ENV=development",
			"API_URL=https://api.dev.example.com",
			"DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_db",
			"SERVICE_PORT=4000",
		]);
	});

	it("handles undefined environment variables", () => {
		const serviceWithUndefined = `
UNDEFINED_VAR=\${{environment.UNDEFINED_VAR}}
`;

		expect(() =>
			prepareEnvironmentVariables(serviceWithUndefined, "", environmentEnv),
		).toThrow("Invalid environment variable: environment.UNDEFINED_VAR");
	});

	it("allows service variables to override environment variables", () => {
		const serviceOverrideEnv = `
NODE_ENV=production
API_URL=\${{environment.API_URL}}
`;

		const resolved = prepareEnvironmentVariables(
			serviceOverrideEnv,
			"",
			environmentEnv,
		);

		expect(resolved).toEqual([
			"NODE_ENV=production", // Overrides environment variable
			"API_URL=https://api.dev.example.com",
		]);
	});

	it("resolves complex references with project, environment, and service variables", () => {
		const complexServiceEnv = `
FULL_DATABASE_URL=\${{project.DATABASE_URL}}/\${{environment.DATABASE_NAME}}
API_ENDPOINT=\${{environment.API_URL}}/\${{project.ENVIRONMENT}}/api
SERVICE_NAME=my-service
COMPLEX_VAR=\${{SERVICE_NAME}}-\${{environment.NODE_ENV}}-\${{project.ENVIRONMENT}}
`;

		const resolved = prepareEnvironmentVariables(
			complexServiceEnv,
			projectEnv,
			environmentEnv,
		);

		expect(resolved).toEqual([
			"FULL_DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_db/dev_database",
			"API_ENDPOINT=https://api.dev.example.com/staging/api",
			"SERVICE_NAME=my-service",
			"COMPLEX_VAR=my-service-development-staging",
		]);
	});

	it("handles environment variables with special characters", () => {
		const specialEnvVars = `
SPECIAL_URL=https://special.com
COMPLEX_KEY="key-with-@#$%^&*()"
JWT_SECRET="secret-with-spaces and symbols!@#"
`;

		const serviceWithSpecial = `
FULL_URL=\${{environment.SPECIAL_URL}}/path?key=\${{environment.COMPLEX_KEY}}
AUTH_SECRET=\${{environment.JWT_SECRET}}
`;

		const resolved = prepareEnvironmentVariables(
			serviceWithSpecial,
			"",
			specialEnvVars,
		);

		expect(resolved).toEqual([
			"FULL_URL=https://special.com/path?key=key-with-@#$%^&*()",
			"AUTH_SECRET=secret-with-spaces and symbols!@#",
		]);
	});

	it("maintains precedence: service > environment > project", () => {
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

		const resolved = prepareEnvironmentVariables(
			serviceWithConflicts,
			conflictingProjectEnv,
			conflictingEnvironmentEnv,
		);

		expect(resolved).toEqual([
			"NODE_ENV=service-override", // Service wins
			"PROJECT_ENV=production-project", // Project reference
			"ENV_VAR=https://environment.api.com", // Environment reference
			"DB_NAME=env_db", // Environment reference
		]);
	});

	it("handles empty environment variables", () => {
		const serviceWithEmpty = `
SERVICE_VAR=test
PROJECT_VAR=\${{project.ENVIRONMENT}}
`;

		const resolved = prepareEnvironmentVariables(
			serviceWithEmpty,
			projectEnv,
			"",
		);

		expect(resolved).toEqual(["SERVICE_VAR=test", "PROJECT_VAR=staging"]);
	});

	it("handles mixed quotes and environment variables", () => {
		const envWithQuotes = `
QUOTED_VAR="development"
SINGLE_QUOTED='https://api.dev.example.com'
MIXED_VAR="value with 'single' quotes"
`;

		const serviceWithQuotes = `
NODE_ENV=\${{environment.QUOTED_VAR}}
API_URL=\${{environment.SINGLE_QUOTED}}
COMPLEX="Prefix-\${{environment.MIXED_VAR}}-Suffix"
`;

		const resolved = prepareEnvironmentVariables(
			serviceWithQuotes,
			"",
			envWithQuotes,
		);

		expect(resolved).toEqual([
			"NODE_ENV=development",
			"API_URL=https://api.dev.example.com",
			"COMPLEX=Prefix-value with 'single' quotes-Suffix",
		]);
	});

	it("resolves multiple environment references in single value", () => {
		const multiRefEnv = `
HOST=localhost
PORT=5432
USERNAME=postgres
PASSWORD=secret123
`;

		const serviceWithMultiRefs = `
DATABASE_URL=postgresql://\${{environment.USERNAME}}:\${{environment.PASSWORD}}@\${{environment.HOST}}:\${{environment.PORT}}/mydb
CONNECTION_STRING=\${{environment.HOST}}:\${{environment.PORT}}
`;

		const resolved = prepareEnvironmentVariables(
			serviceWithMultiRefs,
			"",
			multiRefEnv,
		);

		expect(resolved).toEqual([
			"DATABASE_URL=postgresql://postgres:secret123@localhost:5432/mydb",
			"CONNECTION_STRING=localhost:5432",
		]);
	});

	it("handles nested references with environment and project variables", () => {
		const nestedProjectEnv = `
BASE_DOMAIN=example.com
PROTOCOL=https
`;

		const nestedEnvironmentEnv = `
SUBDOMAIN=api.dev
PATH_PREFIX=/v1
`;

		const serviceWithNested = `
FULL_URL=\${{project.PROTOCOL}}://\${{environment.SUBDOMAIN}}.\${{project.BASE_DOMAIN}}\${{environment.PATH_PREFIX}}/endpoint
API_BASE=\${{project.PROTOCOL}}://\${{environment.SUBDOMAIN}}.\${{project.BASE_DOMAIN}}
`;

		const resolved = prepareEnvironmentVariables(
			serviceWithNested,
			nestedProjectEnv,
			nestedEnvironmentEnv,
		);

		expect(resolved).toEqual([
			"FULL_URL=https://api.dev.example.com/v1/endpoint",
			"API_BASE=https://api.dev.example.com",
		]);
	});

	it("throws error for malformed environment variable references", () => {
		const serviceWithMalformed = `
MALFORMED1=\${{environment.}}
MALFORMED2=\${{environment}}
VALID=\${{environment.NODE_ENV}}
`;

		// Should throw error for empty variable name after environment.
		expect(() =>
			prepareEnvironmentVariables(serviceWithMalformed, "", environmentEnv),
		).toThrow("Invalid environment variable: environment.");
	});

	it("handles environment variables with numeric values", () => {
		const numericEnv = `
PORT=8080
TIMEOUT=30
RETRY_COUNT=3
PERCENTAGE=99.5
`;

		const serviceWithNumeric = `
SERVER_PORT=\${{environment.PORT}}
REQUEST_TIMEOUT=\${{environment.TIMEOUT}}
MAX_RETRIES=\${{environment.RETRY_COUNT}}
SUCCESS_RATE=\${{environment.PERCENTAGE}}
`;

		const resolved = prepareEnvironmentVariables(
			serviceWithNumeric,
			"",
			numericEnv,
		);

		expect(resolved).toEqual([
			"SERVER_PORT=8080",
			"REQUEST_TIMEOUT=30",
			"MAX_RETRIES=3",
			"SUCCESS_RATE=99.5",
		]);
	});

	it("handles boolean-like environment variables", () => {
		const booleanEnv = `
DEBUG=true
ENABLED=false
PRODUCTION=1
DEVELOPMENT=0
`;

		const serviceWithBoolean = `
DEBUG_MODE=\${{environment.DEBUG}}
FEATURE_ENABLED=\${{environment.ENABLED}}
IS_PROD=\${{environment.PRODUCTION}}
IS_DEV=\${{environment.DEVELOPMENT}}
`;

		const resolved = prepareEnvironmentVariables(
			serviceWithBoolean,
			"",
			booleanEnv,
		);

		expect(resolved).toEqual([
			"DEBUG_MODE=true",
			"FEATURE_ENABLED=false",
			"IS_PROD=1",
			"IS_DEV=0",
		]);
	});
});
