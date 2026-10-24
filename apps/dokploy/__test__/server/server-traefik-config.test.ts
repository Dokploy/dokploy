import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	createServerTraefikConfig,
	getDefaultServerTraefikConfig,
	setupNetwork,
} from "@dokploy/server";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const WORKER = "active false";
const MANAGER = "active true";

const sandboxes: string[] = [];

afterEach(() => {
	for (const dir of sandboxes.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const makeSandbox = (swarmRole: string) => {
	const dir = mkdtempSync(path.join(tmpdir(), "dokploy-traefik-step-"));
	sandboxes.push(dir);
	const binDir = path.join(dir, "bin");
	const dockerLog = path.join(dir, "docker.log");
	mkdirSync(binDir);
	writeFileSync(
		path.join(binDir, "docker"),
		`#!/bin/sh
echo "$*" >> "${dockerLog}"
if [ "$1" = "info" ]; then echo "${swarmRole}"; fi
exit 0
`,
	);
	chmodSync(path.join(binDir, "docker"), 0o755);
	const run = (script: string) =>
		execFileSync("bash", ["-c", `set -e; SUDO_CMD=""; ${script}`], {
			encoding: "utf8",
			env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
		});
	const dockerCalls = () =>
		existsSync(dockerLog)
			? readFileSync(dockerLog, "utf8").trim().split("\n")
			: [];
	return { dir, run, dockerCalls };
};

const runStep = (swarmRole: string, existingConfig?: string) => {
	const { dir, run, dockerCalls } = makeSandbox(swarmRole);
	const traefikDir = path.join(dir, "traefik");
	mkdirSync(path.join(traefikDir, "dynamic"), { recursive: true });
	const configPath = path.join(traefikDir, "traefik.yml");
	if (existingConfig !== undefined) {
		writeFileSync(configPath, existingConfig);
	}

	const output = run(createServerTraefikConfig(traefikDir));

	const backupPath = `${configPath}.bak`;
	return {
		output,
		config: readFileSync(configPath, "utf8"),
		backup: existsSync(backupPath) ? readFileSync(backupPath, "utf8") : null,
		tmpLeft: existsSync(`${configPath}.tmp`),
		dockerCalls: dockerCalls(),
	};
};

const withoutSwarm = (yaml: string) => {
	const parsed = parse(yaml);
	delete parsed.providers.swarm;
	return parsed;
};

const handEdited = `# Custom Traefik config
global:
  sendAnonymousUsage: false

providers:
    # file provider first on purpose
    file:
        directory: /etc/dokploy/traefik/dynamic
        watch: true

    swarm:
        exposedByDefault: false
        # keep watching
        watch: true
        endpoint: "unix:///var/run/docker.sock"

    docker:
        exposedByDefault: false
        network: dokploy-network
log:
    level: DEBUG
experimental:
    plugins:
        swarm:
            moduleName: github.com/example/swarm
            version: v1.0.0
certificatesResolvers:
    letsencrypt:
        acme:
            email: ops@example.com
            storage: /etc/dokploy/traefik/dynamic/acme.json
`;

describe("createServerTraefikConfig", () => {
	it("keeps the generated manager config identical", () => {
		const { config, dockerCalls } = runStep(MANAGER);

		expect(config).toBe(`${getDefaultServerTraefikConfig()}\n`);
		expect(parse(config).providers.swarm).toEqual({
			exposedByDefault: false,
			watch: true,
		});
		expect(dockerCalls.some((call) => call.startsWith("restart"))).toBe(false);
	});

	it("writes a config without the Swarm provider on a fresh worker", () => {
		const { config } = runStep(WORKER);

		expect(config).toBe(`${getDefaultServerTraefikConfig(false)}\n`);
		expect(withoutSwarm(getDefaultServerTraefikConfig())).toEqual(
			parse(config),
		);
		expect(parse(config).providers.docker).toBeDefined();
		expect(parse(config).providers.file).toBeDefined();
	});

	it("removes the Swarm provider from an existing default worker config and restarts Traefik", () => {
		const original = `${getDefaultServerTraefikConfig()}\n`;
		const { config, backup, tmpLeft, dockerCalls, output } = runStep(
			WORKER,
			original,
		);

		expect(config).toBe(`${getDefaultServerTraefikConfig(false)}\n`);
		expect(backup).toBe(original);
		expect(tmpLeft).toBe(false);
		expect(dockerCalls).toContain("restart dokploy-traefik");
		expect(output).toContain("Removed Swarm provider");
	});

	it("removes only providers.swarm from a hand-edited worker config", () => {
		const { config, backup, dockerCalls } = runStep(WORKER, handEdited);

		expect(parse(config)).toEqual(withoutSwarm(handEdited));
		expect(parse(config).experimental.plugins.swarm).toBeDefined();
		expect(config).toContain("# file provider first on purpose");
		expect(config).toContain("# Custom Traefik config");
		expect(config).not.toContain("keep watching");
		expect(backup).toBe(handEdited);
		expect(dockerCalls).toContain("restart dokploy-traefik");
	});

	it("removes an inline Swarm provider on a worker", () => {
		const original = `providers:
  swarm: { exposedByDefault: false }
  docker:
    exposedByDefault: false
api:
  insecure: true
`;
		const { config } = runStep(WORKER, original);

		expect(parse(config)).toEqual(withoutSwarm(original));
	});

	it.each([
		[
			"a multiline flow mapping",
			`providers:
  swarm: {
    exposedByDefault: false
  }
  docker:
    exposedByDefault: false
`,
		],
		[
			"a quoted key",
			`providers:
  "swarm":
    exposedByDefault: false
  docker:
    exposedByDefault: false
`,
		],
		[
			"an inline providers mapping",
			`providers: { swarm: { exposedByDefault: false }, docker: {} }
`,
		],
	])(
		"leaves a worker config with %s untouched and warns",
		(_form, original) => {
			const { config, backup, dockerCalls, output } = runStep(WORKER, original);

			expect(config).toBe(original);
			expect(backup).toBeNull();
			expect(dockerCalls.some((call) => call.startsWith("restart"))).toBe(
				false,
			);
			expect(output).toContain("Could not remove providers.swarm");
		},
	);

	it("leaves a worker config without the Swarm provider untouched", () => {
		const original = `${getDefaultServerTraefikConfig(false)}\n`;
		const { config, backup, tmpLeft, dockerCalls } = runStep(WORKER, original);

		expect(config).toBe(original);
		expect(backup).toBeNull();
		expect(tmpLeft).toBe(false);
		expect(dockerCalls.some((call) => call.startsWith("restart"))).toBe(false);
	});

	it.each([
		["manager", MANAGER],
		["non-Swarm node", "inactive false"],
	])("never modifies an existing config on a %s", (_role, swarmRole) => {
		const { config, backup, dockerCalls } = runStep(swarmRole, handEdited);

		expect(config).toBe(handEdited);
		expect(backup).toBeNull();
		expect(dockerCalls.some((call) => call.startsWith("restart"))).toBe(false);
	});
});

describe("setupNetwork", () => {
	it("does not try to create the overlay network on a Swarm worker", () => {
		const { run, dockerCalls } = makeSandbox(WORKER);

		const output = run(setupNetwork());

		expect(output).toContain("managed by the Swarm manager");
		expect(
			dockerCalls().some((call) => call.startsWith("network create")),
		).toBe(false);
	});

	it("creates the overlay network on a manager", () => {
		const { run, dockerCalls } = makeSandbox(MANAGER);

		run(setupNetwork());

		expect(dockerCalls()).toContain(
			"network create --driver overlay --attachable dokploy-network",
		);
	});
});
