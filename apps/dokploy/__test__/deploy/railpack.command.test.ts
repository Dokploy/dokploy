import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { getRailpackCommand } from "@dokploy/server/utils/builders/railpack";
import { describe, expect, it } from "vitest";

const createApplication = (
	overrides: Partial<ApplicationNested> = {},
): ApplicationNested =>
	({
		appName: "test-app",
		buildType: "railpack",
		sourceType: "git",
		buildPath: "/",
		railpackVersion: "0.15.4",
		env: "TEST_VAR=one",
		cleanCache: false,
		environment: {
			project: {
				env: "",
			},
			env: "",
		},
		...overrides,
	}) as unknown as ApplicationNested;

const getSecretsHash = (command: string) => {
	const match = command.match(/secrets-hash=([a-f0-9]{64})/);
	if (!match?.[1]) {
		throw new Error("secrets-hash build arg was not found");
	}

	return match[1];
};

describe("getRailpackCommand", () => {
	it("includes secrets-hash without clean cache", () => {
		const command = getRailpackCommand(createApplication());

		expect(command).toContain("--build-arg secrets-hash=");
		expect(command).not.toContain("cache-key=");
	});

	it("includes cache-key only when clean cache is enabled", () => {
		const command = getRailpackCommand(
			createApplication({
				cleanCache: true,
			}),
		);

		expect(command).toContain("--build-arg secrets-hash=");
		expect(command).toContain("--build-arg cache-key=");
	});

	it("changes secrets-hash when an environment value changes", () => {
		const firstCommand = getRailpackCommand(
			createApplication({
				env: "TEST_VAR=one",
			}),
		);
		const secondCommand = getRailpackCommand(
			createApplication({
				env: "TEST_VAR=two",
			}),
		);

		expect(getSecretsHash(firstCommand)).not.toEqual(
			getSecretsHash(secondCommand),
		);
	});

	it("changes secrets-hash when referenced project or environment values change", () => {
		const firstCommand = getRailpackCommand(
			createApplication({
				env: [
					"PROJECT_VALUE=${{project.SHARED_VALUE}}",
					"ENVIRONMENT_VALUE=${{environment.SHARED_VALUE}}",
				].join("\n"),
				environment: {
					project: {
						env: "SHARED_VALUE=one",
					},
					env: "SHARED_VALUE=alpha",
				},
			} as Partial<ApplicationNested>),
		);
		const secondCommand = getRailpackCommand(
			createApplication({
				env: [
					"PROJECT_VALUE=${{project.SHARED_VALUE}}",
					"ENVIRONMENT_VALUE=${{environment.SHARED_VALUE}}",
				].join("\n"),
				environment: {
					project: {
						env: "SHARED_VALUE=two",
					},
					env: "SHARED_VALUE=beta",
				},
			} as Partial<ApplicationNested>),
		);

		expect(getSecretsHash(firstCommand)).not.toEqual(
			getSecretsHash(secondCommand),
		);
	});
});
