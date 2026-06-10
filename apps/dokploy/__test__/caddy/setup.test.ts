import { afterEach, describe, expect, test, vi } from "vitest";

const validateCaddyConfigWithContainerMock = vi.hoisted(() => vi.fn());
const ensureDefaultCaddyConfigMock = vi.hoisted(() => vi.fn());
const getRemoteDockerMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/utils/caddy/config", () => ({
	CADDY_METRICS_PORT: 2020,
	ensureDefaultCaddyConfig: ensureDefaultCaddyConfigMock,
	reloadCaddyAfterValidation: vi.fn(),
	validateCaddyConfigWithContainer: validateCaddyConfigWithContainerMock,
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const loadCaddySetup = async () => {
	vi.resetModules();
	vi.unstubAllEnvs();
	vi.stubEnv("CADDY_VERSION", "");
	return import("@dokploy/server/setup/caddy-setup");
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe("Caddy runtime setup", () => {
	test("defaults to the pinned Caddy 2.11.4 image tag", async () => {
		const { CADDY_VERSION } = await loadCaddySetup();

		expect(CADDY_VERSION).toBe("2.11.4");
	});

	test("uses the pinned default image for standalone Caddy", async () => {
		const createContainer = vi.fn();
		const start = vi.fn();
		const remove = vi.fn().mockRejectedValue(new Error("missing"));
		const docker = {
			pull: vi.fn(
				(_imageName: string, callback: (error: Error | null) => void) => {
					callback(null);
				},
			),
			modem: { followProgress: vi.fn() },
			createContainer,
			getContainer: vi.fn(() => ({ remove, start })),
		};
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigWithContainerMock.mockResolvedValue(undefined);
		const { initializeStandaloneCaddy } = await loadCaddySetup();

		await initializeStandaloneCaddy();

		expect(docker.pull).toHaveBeenCalledWith(
			"caddy:2.11.4",
			expect.any(Function),
		);
		expect(createContainer).toHaveBeenCalledWith(
			expect.objectContaining({
				Image: "caddy:2.11.4",
				HostConfig: expect.objectContaining({
					Binds: expect.arrayContaining([
						expect.stringMatching(/\/caddy:\/etc\/caddy$/),
						expect.stringMatching(/\/certificates:.*\/certificates:ro$/),
					]),
				}),
			}),
		);
		const binds = (createContainer.mock.calls[0]?.[0] as any).HostConfig.Binds;
		expect(binds).toEqual(
			expect.arrayContaining([expect.stringMatching(/\/caddy:\/etc\/caddy$/)]),
		);
		expect(binds).not.toEqual(
			expect.arrayContaining([
				expect.stringMatching(
					/\/caddy\/caddy\.json:\/etc\/caddy\/caddy\.json$/,
				),
			]),
		);
	});

	test("does not publish the Caddy admin port for standalone Caddy", async () => {
		const createContainer = vi.fn();
		const start = vi.fn();
		const remove = vi.fn().mockRejectedValue(new Error("missing"));
		const docker = {
			pull: vi.fn(
				(_imageName: string, callback: (error: Error | null) => void) => {
					callback(null);
				},
			),
			modem: { followProgress: vi.fn() },
			createContainer,
			getContainer: vi.fn(() => ({ remove, start })),
		};
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigWithContainerMock.mockResolvedValue(undefined);
		const { initializeStandaloneCaddy } = await loadCaddySetup();

		await initializeStandaloneCaddy({
			additionalPorts: [
				{ targetPort: 2019, publishedPort: 2019, protocol: "tcp" },
				{ targetPort: 2020, publishedPort: 2020, protocol: "tcp" },
				{ targetPort: 9001, publishedPort: 2019, protocol: "tcp" },
				{ targetPort: 9002, publishedPort: 2020, protocol: "tcp" },
				{ targetPort: 8080, publishedPort: 18080, protocol: "tcp" },
				{ targetPort: 8082, publishedPort: 18082, protocol: "tcp" },
				{ targetPort: 9000, publishedPort: 9000, protocol: "tcp" },
			],
		});

		const createOptions = createContainer.mock.calls[0]?.[0] as any;
		expect(createOptions.ExposedPorts).not.toHaveProperty("2019/tcp");
		expect(createOptions.HostConfig.PortBindings).not.toHaveProperty(
			"2019/tcp",
		);
		expect(createOptions.ExposedPorts).not.toHaveProperty("2020/tcp");
		expect(createOptions.HostConfig.PortBindings).not.toHaveProperty(
			"2020/tcp",
		);
		expect(createOptions.ExposedPorts).not.toHaveProperty("9001/tcp");
		expect(createOptions.HostConfig.PortBindings["9001/tcp"]).toBeUndefined();
		expect(createOptions.ExposedPorts).not.toHaveProperty("9002/tcp");
		expect(createOptions.HostConfig.PortBindings["9002/tcp"]).toBeUndefined();
		expect(createOptions.ExposedPorts).toHaveProperty("8080/tcp");
		expect(createOptions.HostConfig.PortBindings["8080/tcp"]).toEqual([
			{ HostPort: "18080" },
		]);
		expect(createOptions.ExposedPorts).toHaveProperty("8082/tcp");
		expect(createOptions.HostConfig.PortBindings["8082/tcp"]).toEqual([
			{ HostPort: "18082" },
		]);
		expect(createOptions.ExposedPorts).toHaveProperty("9000/tcp");
		expect(createOptions.HostConfig.PortBindings["9000/tcp"]).toEqual([
			{ HostPort: "9000" },
		]);
	});

	test("passes access-log settings into standalone Caddy config generation", async () => {
		const createContainer = vi.fn();
		const start = vi.fn();
		const remove = vi.fn().mockRejectedValue(new Error("missing"));
		const docker = {
			pull: vi.fn(
				(_imageName: string, callback: (error: Error | null) => void) => {
					callback(null);
				},
			),
			modem: { followProgress: vi.fn() },
			createContainer,
			getContainer: vi.fn(() => ({ remove, start })),
		};
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigWithContainerMock.mockResolvedValue(undefined);
		const { initializeStandaloneCaddy } = await loadCaddySetup();

		await initializeStandaloneCaddy({
			letsEncryptEmail: "ops@example.com",
			accessLogs: { enabled: true },
		});

		expect(ensureDefaultCaddyConfigMock).toHaveBeenCalledWith(
			expect.objectContaining({
				letsEncryptEmail: "ops@example.com",
				accessLogs: { enabled: true },
			}),
		);
	});

	test("does not publish the Caddy admin port for Caddy services", async () => {
		const createService = vi.fn();
		const docker = {
			pull: vi.fn(
				(_imageName: string, callback: (error: Error | null) => void) => {
					callback(null);
				},
			),
			modem: { followProgress: vi.fn() },
			createService,
			getService: vi.fn(() => ({
				inspect: vi.fn().mockRejectedValue(new Error("missing")),
			})),
		};
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		const { initializeCaddyService } = await loadCaddySetup();

		await initializeCaddyService({
			accessLogs: { enabled: true },
			additionalPorts: [
				{ targetPort: 2019, publishedPort: 2019, protocol: "tcp" },
				{ targetPort: 2020, publishedPort: 2020, protocol: "tcp" },
				{ targetPort: 9001, publishedPort: 2019, protocol: "tcp" },
				{ targetPort: 9002, publishedPort: 2020, protocol: "tcp" },
				{ targetPort: 8080, publishedPort: 18080, protocol: "tcp" },
				{ targetPort: 8082, publishedPort: 18082, protocol: "tcp" },
				{ targetPort: 9000, publishedPort: 9000, protocol: "tcp" },
			],
		});

		const createOptions = createService.mock.calls[0]?.[0] as any;
		expect(createOptions.TaskTemplate.ContainerSpec.Mounts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					Type: "bind",
					Source: expect.stringMatching(/\/caddy$/),
					Target: "/etc/caddy",
				}),
			]),
		);
		expect(createOptions.EndpointSpec.Ports).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ TargetPort: 2019, Protocol: "tcp" }),
			]),
		);
		expect(createOptions.EndpointSpec.Ports).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ TargetPort: 2020, Protocol: "tcp" }),
			]),
		);
		expect(createOptions.EndpointSpec.Ports).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ PublishedPort: 2019, Protocol: "tcp" }),
			]),
		);
		expect(createOptions.EndpointSpec.Ports).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ PublishedPort: 2020, Protocol: "tcp" }),
			]),
		);
		expect(createOptions.EndpointSpec.Ports).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					TargetPort: 8080,
					PublishedPort: 18080,
					Protocol: "tcp",
				}),
				expect.objectContaining({
					TargetPort: 8082,
					PublishedPort: 18082,
					Protocol: "tcp",
				}),
				expect.objectContaining({
					TargetPort: 9000,
					PublishedPort: 9000,
					Protocol: "tcp",
				}),
			]),
		);
		expect(ensureDefaultCaddyConfigMock).toHaveBeenCalledWith(
			expect.objectContaining({ accessLogs: { enabled: true } }),
		);
	});
});
