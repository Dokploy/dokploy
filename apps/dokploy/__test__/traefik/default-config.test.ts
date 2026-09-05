import { spawnSync } from "node:child_process";
import {
	createServerTraefikConfigCommand,
	defaultCommand,
	getDefaultServerTraefikConfig,
	getDefaultTraefikConfig,
	isSwarmManager,
} from "@dokploy/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

type TraefikConfig = {
	providers: Record<string, unknown>;
};

const providersFrom = (config: string) =>
	(parse(config) as TraefikConfig).providers;

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("default Traefik provider configuration", () => {
	it("enables the Swarm provider on the local manager", () => {
		vi.stubEnv("NODE_ENV", "production");

		const providers = providersFrom(
			getDefaultTraefikConfig({ enableSwarmProvider: true }),
		);

		expect(providers.swarm).toBeDefined();
		expect(providers.docker).toBeDefined();
		expect(providers.file).toBeDefined();
	});

	it("omits the Swarm provider on a local worker", () => {
		vi.stubEnv("NODE_ENV", "production");

		const providers = providersFrom(
			getDefaultTraefikConfig({ enableSwarmProvider: false }),
		);

		expect(providers.swarm).toBeUndefined();
		expect(providers.docker).toBeDefined();
		expect(providers.file).toBeDefined();
	});

	it("enables the Swarm provider on a remote manager", () => {
		const providers = providersFrom(
			getDefaultServerTraefikConfig({ enableSwarmProvider: true }),
		);

		expect(providers.swarm).toBeDefined();
	});

	it("omits the Swarm provider on a remote worker", () => {
		const providers = providersFrom(
			getDefaultServerTraefikConfig({ enableSwarmProvider: false }),
		);

		expect(providers.swarm).toBeUndefined();
		expect(providers.docker).toBeDefined();
		expect(providers.file).toBeDefined();
	});

	it.each([
		["manager", { LocalNodeState: "active", ControlAvailable: true }, true],
		["worker", { LocalNodeState: "active", ControlAvailable: false }, false],
		["non-Swarm node", { LocalNodeState: "inactive" }, false],
	])("identifies a %s from Docker info", (_role, swarm, expected) => {
		expect(isSwarmManager({ Swarm: swarm })).toBe(expected);
	});

	it("makes remote server setup choose providers from the node role", () => {
		const setupCommand = createServerTraefikConfigCommand();

		expect(setupCommand).toContain(
			"docker info --format '{{.Swarm.LocalNodeState}} {{.Swarm.ControlAvailable}}'",
		);
		expect(setupCommand).toContain(
			getDefaultServerTraefikConfig({ enableSwarmProvider: true }),
		);
		expect(setupCommand).toContain(
			getDefaultServerTraefikConfig({ enableSwarmProvider: false }),
		);
	});

	it("repairs and restarts an existing worker Traefik config", () => {
		const setupCommand = defaultCommand();

		expect(setupCommand).toContain("/^  swarm:[[:space:]]*$/");
		expect(setupCommand).toContain("TRAEFIK_CONFIG_CHANGED=true");
		expect(setupCommand).toContain("docker restart dokploy-traefik");
	});

	it("generates a syntactically valid remote setup script", () => {
		const result = spawnSync("bash", ["-n"], {
			input: defaultCommand(),
			encoding: "utf8",
		});

		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
	});
});
