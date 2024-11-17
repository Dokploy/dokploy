import { prepareEnvironmentVariables } from "@dokploy/server/index";
import { describe, expect, it } from "vitest";

const projectEnv = `
ENVIRONMENT=staging
DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_db
PORT=3000
`;
const serviceEnv = `
ENVIRONMENT=\${{shared.ENVIRONMENT}}
DATABASE_URL=\${{shared.DATABASE_URL}}
SERVICE_PORT=4000
`;

describe("prepareEnvironmentVariables", () => {
	it("resolves shared variables correctly", () => {
		const resolved = prepareEnvironmentVariables(serviceEnv, projectEnv);

		expect(resolved).toEqual([
			"ENVIRONMENT=staging",
			"DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_db",
			"SERVICE_PORT=4000",
		]);
	});

	it("handles undefined shared variables", () => {
		const incompleteProjectEnv = `
		NODE_ENV=production
		`;

		const invalidServiceEnv = `
		UNDEFINED_VAR=\${{shared.UNDEFINED_VAR}}
		`;

		expect(
			() =>
				prepareEnvironmentVariables(invalidServiceEnv, incompleteProjectEnv), // Cambiado el orden
		).toThrow("Invalid shared environment variable: shared.UNDEFINED_VAR");
	});
	it("allows service-specific variables to override shared variables", () => {
		const serviceSpecificEnv = `
		ENVIRONMENT=production
		DATABASE_URL=\${{shared.DATABASE_URL}}
		`;

		const resolved = prepareEnvironmentVariables(
			serviceSpecificEnv,
			projectEnv,
		);

		expect(resolved).toEqual([
			"ENVIRONMENT=production", // Overrides shared variable
			"DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_db",
		]);
	});

	it("resolves complex references for dynamic endpoints", () => {
		const projectEnv = `
BASE_URL=https://api.example.com
API_VERSION=v1
PORT=8000
`;
		const serviceEnv = `
API_ENDPOINT=\${{shared.BASE_URL}}/\${{shared.API_VERSION}}/endpoint
SERVICE_PORT=9000
`;
		const resolved = prepareEnvironmentVariables(serviceEnv, projectEnv);

		expect(resolved).toEqual([
			"API_ENDPOINT=https://api.example.com/v1/endpoint",
			"SERVICE_PORT=9000",
		]);
	});

	it("handles missing shared variables gracefully", () => {
		const projectEnv = `
PORT=8080
`;
		const serviceEnv = `
MISSING_VAR=\${{shared.MISSING_KEY}}
SERVICE_PORT=3000
`;

		expect(() => prepareEnvironmentVariables(serviceEnv, projectEnv)).toThrow(
			"Invalid shared environment variable: shared.MISSING_KEY",
		);
	});

	it("overrides shared variables with service-specific values", () => {
		const projectEnv = `
ENVIRONMENT=staging
DATABASE_URL=postgres://project:project@localhost:5432/project_db
`;
		const serviceEnv = `
ENVIRONMENT=\${{shared.ENVIRONMENT}}
DATABASE_URL=postgres://service:service@localhost:5432/service_db
SERVICE_NAME=my-service
`;
		const resolved = prepareEnvironmentVariables(serviceEnv, projectEnv);

		expect(resolved).toEqual([
			"ENVIRONMENT=staging",
			"DATABASE_URL=postgres://service:service@localhost:5432/service_db",
			"SERVICE_NAME=my-service",
		]);
	});

	it("handles shared variables with normal and unusual characters", () => {
		const projectEnv = `
ENVIRONMENT=PRODUCTION
`;

		// Needs to be in quotes
		const serviceEnv = `
NODE_ENV=\${{shared.ENVIRONMENT}}
SPECIAL_VAR="$^@$^@#$^@!#$@#$-\${{shared.ENVIRONMENT}}"
`;

		const resolved = prepareEnvironmentVariables(serviceEnv, projectEnv);

		expect(resolved).toEqual([
			"NODE_ENV=PRODUCTION",
			"SPECIAL_VAR=$^@$^@#$^@!#$@#$-PRODUCTION",
		]);
	});

	it("handles complex cases with multiple references, special characters, and spaces", () => {
		const projectEnv = `
ENVIRONMENT=STAGING
APP_NAME=MyApp
`;

		const serviceEnv = `
NODE_ENV=\${{shared.ENVIRONMENT}}
COMPLEX_VAR="Prefix-$#^!@-\${{shared.ENVIRONMENT}}--\${{shared.APP_NAME}} Suffix "
`;
		const resolved = prepareEnvironmentVariables(serviceEnv, projectEnv);

		expect(resolved).toEqual([
			"NODE_ENV=STAGING",
			"COMPLEX_VAR=Prefix-$#^!@-STAGING--MyApp Suffix ",
		]);
	});

	it("handles references enclosed in single quotes", () => {
		const projectEnv = `
	ENVIRONMENT=STAGING
	APP_NAME=MyApp
	`;

		const serviceEnv = `
	NODE_ENV='\${{shared.ENVIRONMENT}}'
	COMPLEX_VAR='Prefix-$#^!@-\${{shared.ENVIRONMENT}}--\${{shared.APP_NAME}} Suffix'
	`;
		const resolved = prepareEnvironmentVariables(serviceEnv, projectEnv);

		expect(resolved).toEqual([
			"NODE_ENV=STAGING",
			"COMPLEX_VAR=Prefix-$#^!@-STAGING--MyApp Suffix",
		]);
	});

	it("handles double and single quotes combined", () => {
		const projectEnv = `
ENVIRONMENT=PRODUCTION
APP_NAME=MyApp
`;
		const serviceEnv = `
NODE_ENV="'\${{shared.ENVIRONMENT}}'"
COMPLEX_VAR="'Prefix \"DoubleQuoted\" and \${{shared.APP_NAME}}'"
`;
		const resolved = prepareEnvironmentVariables(serviceEnv, projectEnv);

		expect(resolved).toEqual([
			"NODE_ENV='PRODUCTION'",
			"COMPLEX_VAR='Prefix \"DoubleQuoted\" and MyApp'",
		]);
	});
});
