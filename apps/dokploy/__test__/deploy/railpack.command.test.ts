import type { ApplicationNested } from "@dokploy/server/utils/builders";
import type { BuildPlan } from "@dokploy/server/utils/builders/build-platform";
import { getRailpackCommand } from "@dokploy/server/utils/builders/railpack";
import { describe, expect, it } from "vitest";

const localPlan = (overrides: Partial<BuildPlan> = {}): BuildPlan => ({
	platforms: [],
	builder: null,
	output: { mode: "local", image: "test-app" },
	...overrides,
});

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
		const command = getRailpackCommand(createApplication(), localPlan());

		expect(command).toContain("--build-arg secrets-hash=");
		expect(command).toContain("network=host");
		expect(command).not.toContain("cache-key=");
	});

	it("includes cache-key only when clean cache is enabled", () => {
		const command = getRailpackCommand(
			createApplication({
				cleanCache: true,
			}),
			localPlan(),
		);

		expect(command).toContain("--build-arg secrets-hash=");
		expect(command).toContain("--build-arg cache-key=");
	});

	it("installs Railpack through sudo for non-root users", () => {
		const command = getRailpackCommand(createApplication(), localPlan());

		expect(command).toContain(
			'$SUDO_CMD bash -c "$(curl -fsSL https://railpack.com/install.sh)"',
		);
		expect(command).toContain("sudo -n true 2>/dev/null");
	});

	it("changes secrets-hash when an environment value changes", () => {
		const firstCommand = getRailpackCommand(
			createApplication({
				env: "TEST_VAR=one",
			}),
			localPlan(),
		);
		const secondCommand = getRailpackCommand(
			createApplication({
				env: "TEST_VAR=two",
			}),
			localPlan(),
		);

		expect(getSecretsHash(firstCommand)).not.toEqual(
			getSecretsHash(secondCommand),
		);
	});

	it("adds --platform for a single architecture and keeps a local docker output", () => {
		const command = getRailpackCommand(
			createApplication(),
			localPlan({ platforms: ["linux/amd64"] }),
		);

		expect(command).toContain("--platform linux/amd64");
		expect(command).toContain("--output type=docker,name=test-app");
		expect(command).not.toContain("--push");
	});

	it("pushes a multi-arch image instead of loading into docker", () => {
		const command = getRailpackCommand(createApplication(), {
			platforms: ["linux/amd64", "linux/arm64"],
			builder: null,
			output: {
				mode: "push",
				tags: ["ghcr.io/acme/test-app:latest"],
				logins: "",
			},
		});

		expect(command).toContain("--platform linux/amd64,linux/arm64");
		expect(command).toContain("--push");
		expect(command).toContain("network=host");
		expect(command).not.toContain("--output type=docker");
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
			localPlan(),
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
			localPlan(),
		);

		expect(getSecretsHash(firstCommand)).not.toEqual(
			getSecretsHash(secondCommand),
		);
	});
});
