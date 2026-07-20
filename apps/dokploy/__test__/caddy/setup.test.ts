import { afterEach, describe, expect, test, vi } from "vitest";

const validateCaddyConfigWithContainerMock = vi.hoisted(() => vi.fn());
const validateCaddyConfigFileWithImageMock = vi.hoisted(() => vi.fn());
const runActiveCaddyUpstreamPreflightMock = vi.hoisted(() =>
	vi.fn().mockResolvedValue({ status: "passed", checks: [] }),
);
const ensureDefaultCaddyConfigMock = vi.hoisted(() => vi.fn());
const readCaddyConfigFileIfExistsMock = vi.hoisted(() =>
	vi.fn().mockResolvedValue(null),
);
const writeCaddyConfigContentMock = vi.hoisted(() => vi.fn());
const withCaddyConfigLockMock = vi.hoisted(() =>
	vi.fn((_serverId: string | undefined, task: () => Promise<unknown>) =>
		task(),
	),
);
const getRemoteDockerMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/utils/caddy/config", () => ({
	CADDY_METRICS_PORT: 2020,
	ensureDefaultCaddyConfig: ensureDefaultCaddyConfigMock,
	readCaddyConfigFileIfExists: readCaddyConfigFileIfExistsMock,
	reloadCaddyAfterValidation: vi.fn(),
	validateCaddyConfigFileWithImage: validateCaddyConfigFileWithImageMock,
	validateCaddyConfigWithContainer: validateCaddyConfigWithContainerMock,
	withCaddyConfigLock: withCaddyConfigLockMock,
	writeCaddyConfigContent: writeCaddyConfigContentMock,
}));

vi.mock("@dokploy/server/utils/caddy/migration/upstream-preflight", () => ({
	runActiveCaddyUpstreamPreflight: runActiveCaddyUpstreamPreflightMock,
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const loadCaddySetup = async (caddyImage = "") => {
	vi.resetModules();
	vi.unstubAllEnvs();
	vi.stubEnv("CADDY_VERSION", "");
	vi.stubEnv("CADDY_IMAGE", caddyImage);
	return import("@dokploy/server/setup/caddy-setup");
};

const dockerNotFound = () =>
	Object.assign(new Error("missing"), { statusCode: 404 });

const createStandaloneDockerMock = () => {
	const candidate = {
		inspect: vi.fn().mockResolvedValue({
			NetworkSettings: { Networks: { "dokploy-network": {} } },
		}),
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		rename: vi.fn().mockResolvedValue(undefined),
	};
	const previous = {
		inspect: vi.fn().mockRejectedValue(dockerNotFound()),
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		rename: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
	};
	const inspectImage = vi.fn().mockResolvedValue({ Id: "sha256:caddy" });
	const createContainer = vi.fn().mockResolvedValue(candidate);
	const docker = {
		pull: vi.fn(
			(_imageName: string, callback: (error: Error | null) => void) => {
				callback(null);
			},
		),
		modem: { followProgress: vi.fn() },
		createContainer,
		getContainer: vi.fn(() => previous),
		getImage: vi.fn(() => ({ inspect: inspectImage })),
	};

	return { candidate, createContainer, docker, inspectImage, previous };
};

const createServiceDockerMock = () => {
	const createdService = {
		id: "caddy-service",
		inspect: vi.fn().mockResolvedValue({
			ID: "caddy-service",
			Version: { Index: 2 },
			Spec: {
				Name: "dokploy-caddy",
				TaskTemplate: {
					ContainerSpec: { Image: "caddy:2.11.4" },
					Networks: [{ Target: "dokploy-network" }],
				},
			},
			UpdateStatus: { State: "completed" },
		}),
		update: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
	};
	const existingService = {
		id: "caddy-service",
		inspect: vi.fn().mockRejectedValue(dockerNotFound()),
		update: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
	};
	const createService = vi.fn().mockResolvedValue(createdService);
	const inspectImage = vi.fn().mockResolvedValue({ Id: "sha256:caddy" });
	const docker = {
		pull: vi.fn(
			(_imageName: string, callback: (error: Error | null) => void) => {
				callback(null);
			},
		),
		modem: { followProgress: vi.fn() },
		createService,
		getService: vi.fn(() => existingService),
		getImage: vi.fn(() => ({ inspect: inspectImage })),
		listTasks: vi.fn().mockResolvedValue([
			{
				Status: { State: "running" },
				Spec: { ContainerSpec: { Image: "caddy:2.11.4" } },
			},
		]),
	};

	return {
		createdService,
		createService,
		docker,
		existingService,
		inspectImage,
	};
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe("Caddy runtime setup", () => {
	test("defaults to the pinned Caddy 2.11.4 image tag", async () => {
		const { CADDY_IMAGE, CADDY_VERSION } = await loadCaddySetup();

		expect(CADDY_VERSION).toBe("2.11.4");
		expect(CADDY_IMAGE).toBe("caddy:2.11.4");
	});

	test("uses the pinned default image for standalone Caddy", async () => {
		const { createContainer, docker } = createStandaloneDockerMock();
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
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

	test("uses a full CADDY_IMAGE reference for pull, validation, and creation", async () => {
		const imageName =
			"ghcr.io/masonjames/caddy@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
		const { createContainer, docker } = createStandaloneDockerMock();
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		validateCaddyConfigWithContainerMock.mockResolvedValue(undefined);
		const { CADDY_IMAGE, initializeStandaloneCaddy } =
			await loadCaddySetup(imageName);

		await initializeStandaloneCaddy();

		expect(CADDY_IMAGE).toBe(imageName);
		expect(docker.pull).toHaveBeenCalledWith(imageName, expect.any(Function));
		expect(docker.getImage).toHaveBeenCalledWith(imageName);
		expect(validateCaddyConfigFileWithImageMock).toHaveBeenCalledWith(
			expect.stringMatching(/\/caddy\/caddy\.json$/),
			undefined,
			imageName,
		);
		expect(createContainer).toHaveBeenCalledWith(
			expect.objectContaining({ Image: imageName }),
		);
	});

	test("does not publish the Caddy admin port for standalone Caddy", async () => {
		const { createContainer, docker } = createStandaloneDockerMock();
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
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
		const { docker } = createStandaloneDockerMock();
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
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

	test("does not touch the running edge when the candidate pull fails", async () => {
		const { createContainer, docker, previous } = createStandaloneDockerMock();
		docker.pull.mockImplementation(
			(_imageName: string, callback: (error: Error | null) => void) => {
				callback(new Error("pull failed"));
			},
		);
		previous.inspect.mockResolvedValue({ State: { Running: true } });
		readCaddyConfigFileIfExistsMock.mockResolvedValueOnce('{"old":true}\n');
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		const { initializeStandaloneCaddy } = await loadCaddySetup();

		await expect(initializeStandaloneCaddy()).rejects.toThrow("pull failed");

		expect(previous.inspect).not.toHaveBeenCalled();
		expect(previous.stop).not.toHaveBeenCalled();
		expect(previous.rename).not.toHaveBeenCalled();
		expect(previous.remove).not.toHaveBeenCalled();
		expect(createContainer).not.toHaveBeenCalled();
		expect(validateCaddyConfigFileWithImageMock).not.toHaveBeenCalled();
		expect(writeCaddyConfigContentMock).toHaveBeenCalledWith('{"old":true}\n', {
			serverId: undefined,
		});
	});

	test("does not touch the running edge when upstream preflight fails", async () => {
		const { createContainer, docker, previous } = createStandaloneDockerMock();
		runActiveCaddyUpstreamPreflightMock.mockResolvedValueOnce({
			status: "failed",
			checks: [
				{
					status: "failed",
					dial: "app:3000",
					network: "app-network",
					reason: "DNS resolution failed",
				},
			],
		});
		readCaddyConfigFileIfExistsMock.mockResolvedValueOnce('{"old":true}\n');
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		const { initializeStandaloneCaddy } = await loadCaddySetup();

		await expect(initializeStandaloneCaddy()).rejects.toThrow(
			"Caddy runtime upstream preflight failed",
		);

		expect(previous.inspect).not.toHaveBeenCalled();
		expect(previous.stop).not.toHaveBeenCalled();
		expect(createContainer).not.toHaveBeenCalled();
	});

	test("preserves every current edge network on the candidate", async () => {
		const { candidate, createContainer, docker, previous } =
			createStandaloneDockerMock();
		previous.inspect.mockResolvedValue({
			State: { Running: true },
			NetworkSettings: {
				Networks: {
					"dokploy-network": {},
					"avenue941-stack": {},
					"lovinghands-stack": {},
				},
			},
		});
		candidate.inspect.mockResolvedValue({
			NetworkSettings: {
				Networks: {
					"dokploy-network": {},
					"avenue941-stack": {},
					"lovinghands-stack": {},
				},
			},
		});
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		validateCaddyConfigWithContainerMock.mockResolvedValue(undefined);
		const { initializeStandaloneCaddy } = await loadCaddySetup();

		await initializeStandaloneCaddy();

		expect(createContainer).toHaveBeenCalledWith(
			expect.objectContaining({
				NetworkingConfig: {
					EndpointsConfig: {
						"dokploy-network": {},
						"avenue941-stack": {},
						"lovinghands-stack": {},
					},
				},
			}),
		);
	});

	test("restores the retained edge when candidate creation fails", async () => {
		const { createContainer, docker, inspectImage, previous } =
			createStandaloneDockerMock();
		previous.inspect.mockResolvedValue({ State: { Running: true } });
		createContainer.mockRejectedValue(new Error("create failed"));
		readCaddyConfigFileIfExistsMock.mockResolvedValueOnce('{"old":true}\n');
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		const { initializeStandaloneCaddy } = await loadCaddySetup();

		await expect(initializeStandaloneCaddy()).rejects.toThrow("create failed");

		expect(previous.stop).toHaveBeenCalledOnce();
		expect(inspectImage.mock.invocationCallOrder[0]).toBeLessThan(
			previous.stop.mock.invocationCallOrder[0] ?? 0,
		);
		expect(
			validateCaddyConfigFileWithImageMock.mock.invocationCallOrder[0],
		).toBeLessThan(previous.stop.mock.invocationCallOrder[0] ?? 0);
		expect(previous.rename).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				name: expect.stringMatching(/^dokploy-caddy-rollback-\d+$/),
			}),
		);
		expect(previous.rename).toHaveBeenNthCalledWith(2, {
			name: "dokploy-caddy",
		});
		expect(previous.start).toHaveBeenCalledOnce();
		expect(previous.remove).not.toHaveBeenCalled();
		expect(writeCaddyConfigContentMock).toHaveBeenCalledWith('{"old":true}\n', {
			serverId: undefined,
		});
		expect(
			writeCaddyConfigContentMock.mock.invocationCallOrder[0],
		).toBeLessThan(previous.start.mock.invocationCallOrder[0] ?? 0);
	});

	test("removes a failed candidate and restores the retained edge", async () => {
		const { candidate, docker, previous } = createStandaloneDockerMock();
		previous.inspect.mockResolvedValue({ State: { Running: true } });
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		validateCaddyConfigWithContainerMock.mockRejectedValue(
			new Error("runtime validation failed"),
		);
		const { initializeStandaloneCaddy } = await loadCaddySetup();

		await expect(initializeStandaloneCaddy()).rejects.toThrow(
			"runtime validation failed",
		);

		expect(candidate.stop).toHaveBeenCalledOnce();
		expect(candidate.remove).toHaveBeenCalledWith({ force: true });
		expect(previous.rename).toHaveBeenNthCalledWith(2, {
			name: "dokploy-caddy",
		});
		expect(previous.start).toHaveBeenCalledOnce();
		expect(previous.remove).not.toHaveBeenCalled();
	});

	test("restores the retained edge when post-start reconnect fails", async () => {
		const { candidate, docker, previous } = createStandaloneDockerMock();
		previous.inspect.mockResolvedValue({
			State: { Running: true },
			NetworkSettings: { Networks: { "dokploy-network": {} } },
		});
		readCaddyConfigFileIfExistsMock.mockResolvedValueOnce('{"old":true}\n');
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		validateCaddyConfigWithContainerMock.mockResolvedValue(undefined);
		const { initializeStandaloneCaddy } = await loadCaddySetup();
		const reconnect = vi
			.fn()
			.mockRejectedValue(new Error("network attach failed"));

		await expect(initializeStandaloneCaddy({}, reconnect)).rejects.toThrow(
			"network attach failed",
		);

		expect(candidate.remove).toHaveBeenCalledWith({ force: true });
		expect(previous.rename).toHaveBeenNthCalledWith(2, {
			name: "dokploy-caddy",
		});
		expect(previous.start).toHaveBeenCalledOnce();
		expect(writeCaddyConfigContentMock).toHaveBeenCalledWith('{"old":true}\n', {
			serverId: undefined,
		});
	});

	test("renames an unremovable failed candidate before restoring the canonical edge name", async () => {
		const { candidate, docker, previous } = createStandaloneDockerMock();
		previous.inspect.mockResolvedValue({
			State: { Running: true },
			NetworkSettings: { Networks: { "dokploy-network": {} } },
		});
		candidate.remove.mockRejectedValue(new Error("remove failed"));
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		validateCaddyConfigWithContainerMock.mockRejectedValue(
			new Error("runtime validation failed"),
		);
		const { initializeStandaloneCaddy } = await loadCaddySetup();

		await expect(initializeStandaloneCaddy()).rejects.toThrow(
			"runtime validation failed",
		);

		expect(candidate.rename).toHaveBeenCalledWith({
			name: expect.stringMatching(/^dokploy-caddy-failed-\d+$/),
		});
		expect(previous.rename).toHaveBeenNthCalledWith(2, {
			name: "dokploy-caddy",
		});
		expect(previous.start).toHaveBeenCalledOnce();
	});

	test("does not publish the Caddy admin port for Caddy services", async () => {
		const { createService, docker } = createServiceDockerMock();
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		validateCaddyConfigWithContainerMock.mockResolvedValue(undefined);
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

	test("does not inspect or mutate a Caddy service when its image pull fails", async () => {
		const { createService, docker, existingService } =
			createServiceDockerMock();
		docker.pull.mockImplementation(
			(_imageName: string, callback: (error: Error | null) => void) => {
				callback(new Error("service pull failed"));
			},
		);
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		const { initializeCaddyService } = await loadCaddySetup();

		await expect(initializeCaddyService({})).rejects.toThrow(
			"service pull failed",
		);

		expect(existingService.inspect).not.toHaveBeenCalled();
		expect(existingService.update).not.toHaveBeenCalled();
		expect(createService).not.toHaveBeenCalled();
	});

	test("does not misclassify a Caddy service inspection error as absence", async () => {
		const { createService, docker, existingService } =
			createServiceDockerMock();
		existingService.inspect.mockRejectedValue(new Error("manager unavailable"));
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		const { initializeCaddyService } = await loadCaddySetup();

		await expect(initializeCaddyService({})).rejects.toThrow(
			"manager unavailable",
		);

		expect(createService).not.toHaveBeenCalled();
	});

	test("does not create a same-name service when an update is rejected", async () => {
		const { createService, docker, existingService } =
			createServiceDockerMock();
		existingService.inspect.mockResolvedValue({
			ID: "caddy-service",
			Version: { Index: 7 },
			Spec: {
				Name: "dokploy-caddy",
				TaskTemplate: {
					ContainerSpec: { Image: "caddy:2.11.3" },
					Networks: [{ Target: "existing-app-network" }],
				},
			},
		});
		existingService.update.mockRejectedValue(new Error("update rejected"));
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		const { initializeCaddyService } = await loadCaddySetup();

		await expect(initializeCaddyService({})).rejects.toThrow("update rejected");

		expect(createService).not.toHaveBeenCalled();
		expect(existingService.update).toHaveBeenCalledOnce();
	});

	test("preserves service networks and restores the prior spec when reconnect fails", async () => {
		const { docker, existingService } = createServiceDockerMock();
		const previousSpec = {
			Name: "dokploy-caddy",
			TaskTemplate: {
				ContainerSpec: { Image: "caddy:2.11.3" },
				Networks: [{ Target: "existing-app-network" }],
			},
		};
		existingService.inspect.mockResolvedValue({
			ID: "caddy-service",
			Version: { Index: 7 },
			Spec: previousSpec,
		});
		docker.listTasks
			.mockResolvedValueOnce([
				{
					Status: { State: "running" },
					Spec: { ContainerSpec: { Image: "caddy:2.11.4" } },
				},
			])
			.mockResolvedValue([
				{
					Status: { State: "running" },
					Spec: { ContainerSpec: { Image: "caddy:2.11.3" } },
				},
			]);
		readCaddyConfigFileIfExistsMock.mockResolvedValueOnce('{"old":true}\n');
		getRemoteDockerMock.mockResolvedValue(docker);
		ensureDefaultCaddyConfigMock.mockResolvedValue(undefined);
		validateCaddyConfigFileWithImageMock.mockResolvedValue(undefined);
		validateCaddyConfigWithContainerMock.mockResolvedValue(undefined);
		const { initializeCaddyService } = await loadCaddySetup();
		const reconnect = vi.fn().mockRejectedValue(new Error("reconnect failed"));

		await expect(initializeCaddyService({}, reconnect)).rejects.toThrow(
			"reconnect failed",
		);

		const candidateUpdate = existingService.update.mock.calls[0]?.[0] as any;
		expect(candidateUpdate.TaskTemplate.Networks).toEqual([
			{ Target: "existing-app-network" },
			{ Target: "dokploy-network" },
		]);
		expect(existingService.update).toHaveBeenCalledTimes(2);
		expect(existingService.update.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining(previousSpec),
		);
		expect(writeCaddyConfigContentMock).toHaveBeenCalledWith('{"old":true}\n', {
			serverId: undefined,
		});
	});
});
