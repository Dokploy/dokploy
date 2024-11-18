import { prepareEnvironmentVariables } from "@dokploy/server/index";
import { describe, expect, it } from "vitest";

const projectEnv = `
ENVIRONMENT=staging
DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_db
PORT=3000
`;
const serviceEnv = `
ENVIRONMENT=\${{project.ENVIRONMENT}}
DATABASE_URL=\${{project.DATABASE_URL}}
SERVICE_PORT=4000
`;

describe("prepareEnvironmentVariables", () => {
	it("resolves project variables correctly", () => {
		const resolved = prepareEnvironmentVariables(serviceEnv, projectEnv);

		expect(resolved).toEqual([
			"ENVIRONMENT=staging",
			"DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_db",
			"SERVICE_PORT=4000",
		]);
	});

	it("handles undefined project variables", () => {
		const incompleteProjectEnv = `
		NODE_ENV=production
		`;

		const invalidServiceEnv = `
		UNDEFINED_VAR=\${{project.UNDEFINED_VAR}}
		`;

		expect(
			() =>
				prepareEnvironmentVariables(invalidServiceEnv, incompleteProjectEnv), // Cambiado el orden
		).toThrow("Invalid project environment variable: project.UNDEFINED_VAR");
	});
	it("allows service-specific variables to override project variables", () => {
		const serviceSpecificEnv = `
		ENVIRONMENT=production
		DATABASE_URL=\${{project.DATABASE_URL}}
		`;

		const resolved = prepareEnvironmentVariables(
			serviceSpecificEnv,
			projectEnv,
		);

		expect(resolved).toEqual([
			"ENVIRONMENT=production", // Overrides project variable
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
API_ENDPOINT=\${{project.BASE_URL}}/\${{project.API_VERSION}}/endpoint
SERVICE_PORT=9000
`;
		const resolved = prepareEnvironmentVariables(serviceEnv, projectEnv);

		expect(resolved).toEqual([
			"API_ENDPOINT=https://api.example.com/v1/endpoint",
			"SERVICE_PORT=9000",
		]);
	});

	it("handles missing project variables gracefully", () => {
		const projectEnv = `
PORT=8080
`;
		const serviceEnv = `
MISSING_VAR=\${{project.MISSING_KEY}}
SERVICE_PORT=3000
`;

		expect(() => prepareEnvironmentVariables(serviceEnv, projectEnv)).toThrow(
			"Invalid project environment variable: project.MISSING_KEY",
		);
	});

	it("overrides project variables with service-specific values", () => {
		const projectEnv = `
ENVIRONMENT=staging
DATABASE_URL=postgres://project:project@localhost:5432/project_db
`;
		const serviceEnv = `
ENVIRONMENT=\${{project.ENVIRONMENT}}
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

	it("handles project variables with normal and unusual characters", () => {
		const projectEnv = `
ENVIRONMENT=PRODUCTION
`;

		// Needs to be in quotes
		const serviceEnv = `
NODE_ENV=\${{project.ENVIRONMENT}}
SPECIAL_VAR="$^@$^@#$^@!#$@#$-\${{project.ENVIRONMENT}}"
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
NODE_ENV=\${{project.ENVIRONMENT}}
COMPLEX_VAR="Prefix-$#^!@-\${{project.ENVIRONMENT}}--\${{project.APP_NAME}} Suffix "
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
	NODE_ENV='\${{project.ENVIRONMENT}}'
	COMPLEX_VAR='Prefix-$#^!@-\${{project.ENVIRONMENT}}--\${{project.APP_NAME}} Suffix'
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
NODE_ENV="'\${{project.ENVIRONMENT}}'"
COMPLEX_VAR="'Prefix \"DoubleQuoted\" and \${{project.APP_NAME}}'"
`;
		const resolved = prepareEnvironmentVariables(serviceEnv, projectEnv);

		expect(resolved).toEqual([
			"NODE_ENV='PRODUCTION'",
			"COMPLEX_VAR='Prefix \"DoubleQuoted\" and MyApp'",
		]);
	});
});
