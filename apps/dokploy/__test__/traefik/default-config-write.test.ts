import { fs, vol } from "memfs";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

import {
	createDefaultTraefikConfig,
	docker,
	restartStandaloneTraefik,
} from "@dokploy/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parse } from "yaml";

const configPath = "/etc/dokploy/traefik/traefik.yml";

beforeEach(() => {
	vol.reset();
	vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

it.each([
	["manager", true, true],
	["worker", false, false],
] as const)(
	"writes a role-aware config on a local %s",
	async (_role, controlAvailable, expectSwarmProvider) => {
		vi.spyOn(docker, "info").mockResolvedValue({
			Swarm: {
				LocalNodeState: "active",
				ControlAvailable: controlAvailable,
			},
		});

		const configChanged = await createDefaultTraefikConfig();

		const config = parse(vol.readFileSync(configPath, "utf8") as string);
		expect(config.providers.swarm !== undefined).toBe(expectSwarmProvider);
		expect(config.providers.docker).toBeDefined();
		expect(config.providers.file).toBeDefined();
		expect(configChanged).toBe(false);
	},
);

it("removes the Swarm provider from an existing local worker config", async () => {
	vol.fromJSON({
		[configPath]: `
providers:
  swarm:
    exposedByDefault: false
    watch: true
  docker:
    exposedByDefault: false
  file:
    directory: /etc/dokploy/traefik/dynamic
log:
  level: DEBUG
`,
	});
	vi.spyOn(docker, "info").mockResolvedValue({
		Swarm: {
			LocalNodeState: "active",
			ControlAvailable: false,
		},
	});

	const configChanged = await createDefaultTraefikConfig();

	const config = parse(vol.readFileSync(configPath, "utf8") as string);
	expect(config.providers.swarm).toBeUndefined();
	expect(config.providers.docker).toBeDefined();
	expect(config.providers.file).toBeDefined();
	expect(config.log.level).toBe("DEBUG");
	expect(configChanged).toBe(true);
});

it("restores the Swarm provider when a local worker becomes a manager", async () => {
	vol.fromJSON({
		[configPath]: `
providers:
  docker:
    exposedByDefault: false
  file:
    directory: /custom/dynamic
log:
  level: DEBUG
`,
	});
	vi.spyOn(docker, "info").mockResolvedValue({
		Swarm: {
			LocalNodeState: "active",
			ControlAvailable: true,
		},
	});

	const configChanged = await createDefaultTraefikConfig();

	const config = parse(vol.readFileSync(configPath, "utf8") as string);
	expect(config.providers.swarm).toEqual({
		exposedByDefault: false,
		watch: true,
	});
	expect(config.providers.file.directory).toBe("/custom/dynamic");
	expect(config.log.level).toBe("DEBUG");
	expect(configChanged).toBe(true);
});

it("writes a worker-safe config when Docker role detection is unavailable", async () => {
	vi.spyOn(docker, "info").mockRejectedValue(new Error("Docker unavailable"));

	const configChanged = await createDefaultTraefikConfig();

	const config = parse(vol.readFileSync(configPath, "utf8") as string);
	expect(config.providers.swarm).toBeUndefined();
	expect(config.providers.docker).toBeDefined();
	expect(configChanged).toBe(false);
});

it("restarts the standalone Traefik container", async () => {
	const restart = vi.fn().mockResolvedValue(undefined);
	vi.spyOn(docker, "getContainer").mockReturnValue({ restart } as never);

	await restartStandaloneTraefik();

	expect(restart).toHaveBeenCalledOnce();
});
