import { fs, vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

vi.mock("node:fs", () => ({ ...fs, default: fs }));

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	writeFileRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => mocks);

import { paths } from "@dokploy/server/constants";
import {
	createDefaultTraefikConfig,
	getDefaultServerTraefikConfig,
	getDefaultTraefikConfig,
} from "@dokploy/server/setup/traefik-setup";
import { prepareTraefikDashboard } from "@dokploy/server/utils/traefik/dashboard";

const originalConfig = `# Preserve the operator's configuration
api:
  insecure: false
  dashboard: false
  debug: true
entryPoints:
  websecure:
    address: ":8443"
providers:
  file:
    directory: /custom/dynamic
`;

const otherPorts = [{ targetPort: 9000, publishedPort: 9001, protocol: "tcp" }];
const dashboardPort = {
	targetPort: 8080,
	publishedPort: 8080,
	protocol: "tcp",
};
const configPath = `${paths().MAIN_TRAEFIK_PATH}/traefik.yml`;

beforeEach(() => {
	vi.clearAllMocks();
	vol.reset();
	vol.fromJSON({ [configPath]: originalConfig });
	mocks.writeFileRemote.mockResolvedValue(undefined);
});

describe("Traefik dashboard defaults", () => {
	it.each([
		["local", getDefaultTraefikConfig],
		["remote", getDefaultServerTraefikConfig],
	])(
		"does not enable the unauthenticated API for %s installs",
		(_, generate) => {
			expect(parse(generate()).api.insecure).toBe(false);
		},
	);

	it("does not overwrite an existing operator configuration", () => {
		createDefaultTraefikConfig();
		expect(fs.readFileSync(configPath, "utf8")).toBe(originalConfig);
	});
});

describe("Traefik dashboard lifecycle", () => {
	it("enables the listener and port, then disables both", async () => {
		const enabledPorts = await prepareTraefikDashboard(true, otherPorts);
		expect(enabledPorts).toEqual([...otherPorts, dashboardPort]);
		const enabledText = fs.readFileSync(configPath, "utf8").toString();
		const enabledConfig = parse(enabledText);
		expect(enabledConfig.api).toEqual({
			insecure: true,
			dashboard: true,
			debug: true,
		});
		expect(enabledConfig.entryPoints).toEqual(
			parse(originalConfig).entryPoints,
		);
		expect(enabledConfig.providers).toEqual(parse(originalConfig).providers);
		expect(enabledText).toContain("# Preserve the operator's configuration");
		expect(otherPorts).toHaveLength(1);

		const disabledPorts = await prepareTraefikDashboard(false, enabledPorts);
		expect(disabledPorts).toEqual(otherPorts);
		expect(
			parse(fs.readFileSync(configPath, "utf8").toString()).api.insecure,
		).toBe(false);
	});

	it("does not add duplicate dashboard ports on repeated enables", async () => {
		const enabledPorts = await prepareTraefikDashboard(true, otherPorts);
		expect(await prepareTraefikDashboard(true, enabledPorts)).toEqual(
			enabledPorts,
		);
	});

	it("creates the API settings when the section is absent", async () => {
		fs.writeFileSync(configPath, "entryPoints:\n  web:\n    address: ':80'\n");
		await prepareTraefikDashboard(true, []);
		expect(parse(fs.readFileSync(configPath, "utf8").toString()).api).toEqual({
			insecure: true,
			dashboard: true,
		});
	});

	it("updates the remote configuration before returning publishable ports", async () => {
		let remoteConfig = originalConfig;
		mocks.execAsyncRemote.mockImplementation(async () => ({
			stdout: remoteConfig,
		}));
		mocks.writeFileRemote.mockImplementation(async (_, __, text: string) => {
			remoteConfig = text;
		});

		const enabledPorts = await prepareTraefikDashboard(
			true,
			otherPorts,
			"server",
		);
		expect(enabledPorts).toEqual([...otherPorts, dashboardPort]);
		expect(parse(remoteConfig).api.insecure).toBe(true);
		expect(mocks.writeFileRemote).toHaveBeenCalledWith(
			"server",
			"/etc/dokploy/traefik/traefik.yml",
			expect.any(String),
		);

		expect(
			await prepareTraefikDashboard(false, enabledPorts, "server"),
		).toEqual(otherPorts);
		expect(parse(remoteConfig).api.insecure).toBe(false);
		expect(fs.readFileSync(configPath, "utf8")).toBe(originalConfig);
	});

	it("rejects a failed remote write instead of returning publishable ports", async () => {
		mocks.execAsyncRemote.mockResolvedValue({ stdout: originalConfig });
		mocks.writeFileRemote.mockRejectedValue(new Error("SFTP write failed"));
		await expect(
			prepareTraefikDashboard(true, otherPorts, "server"),
		).rejects.toThrow("SFTP write failed");
		expect(otherPorts).toHaveLength(1);
	});

	it.each(["api: [", "api: true", "- not-a-config"])(
		"rejects invalid configuration without overwriting it: %s",
		async (config) => {
			fs.writeFileSync(configPath, config);
			await expect(prepareTraefikDashboard(true, otherPorts)).rejects.toThrow(
				"valid YAML mappings",
			);
			expect(fs.readFileSync(configPath, "utf8")).toBe(config);
		},
	);

	it("rejects a missing configuration before preparing ports", async () => {
		vol.reset();
		await expect(prepareTraefikDashboard(true, otherPorts)).rejects.toThrow(
			"configuration was not found",
		);
	});
});
