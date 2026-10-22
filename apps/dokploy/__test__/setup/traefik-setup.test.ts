import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createContainer: vi.fn(),
	remove: vi.fn(),
	start: vi.fn(),
	getRemoteDocker: vi.fn(),
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

const loadTraefikSetup = async (hostIp?: string) => {
	// undefined removes the variable, so the test does not depend on the caller's env.
	vi.stubEnv("TRAEFIK_HOST_IP", hostIp);
	vi.resetModules();
	return await import("@dokploy/server/setup/traefik-setup");
};

const createdPortBindings = () => {
	const [settings] = mocks.createContainer.mock.calls[0] as [
		{ HostConfig?: { PortBindings?: Record<string, unknown> } },
	];
	return settings.HostConfig?.PortBindings;
};

describe("initializeStandaloneTraefik port bindings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Rejecting pull and remove skips the fixed waits that follow them.
		mocks.remove.mockRejectedValue(new Error("no such container"));
		mocks.start.mockResolvedValue(undefined);
		mocks.createContainer.mockResolvedValue(undefined);
		mocks.getRemoteDocker.mockResolvedValue({
			pull: vi.fn().mockRejectedValue(new Error("offline")),
			getContainer: () => ({ remove: mocks.remove, start: mocks.start }),
			createContainer: mocks.createContainer,
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it("binds on all interfaces when TRAEFIK_HOST_IP is not set", async () => {
		const { initializeStandaloneTraefik } = await loadTraefikSetup();

		await initializeStandaloneTraefik();

		expect(createdPortBindings()).toEqual({
			"80/tcp": [{ HostPort: "80" }],
			"443/tcp": [{ HostPort: "443" }],
			"443/udp": [{ HostPort: "443" }],
		});
	});

	it("binds default, dashboard and additional ports to TRAEFIK_HOST_IP", async () => {
		const { initializeStandaloneTraefik } = await loadTraefikSetup("127.0.0.1");

		await initializeStandaloneTraefik({
			additionalPorts: [
				{ targetPort: 8080, publishedPort: 8080 },
				{ targetPort: 5432, publishedPort: 15432, protocol: "tcp" },
			],
		});

		expect(createdPortBindings()).toEqual({
			"80/tcp": [{ HostIp: "127.0.0.1", HostPort: "80" }],
			"443/tcp": [{ HostIp: "127.0.0.1", HostPort: "443" }],
			"443/udp": [{ HostIp: "127.0.0.1", HostPort: "443" }],
			"8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }],
			"5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "15432" }],
		});
	});

	it("trims surrounding whitespace from TRAEFIK_HOST_IP", async () => {
		const { initializeStandaloneTraefik } =
			await loadTraefikSetup(" 127.0.0.1 ");

		await initializeStandaloneTraefik();

		expect(createdPortBindings()?.["80/tcp"]).toEqual([
			{ HostIp: "127.0.0.1", HostPort: "80" },
		]);
	});

	it("accepts an IPv6 TRAEFIK_HOST_IP", async () => {
		const { initializeStandaloneTraefik } = await loadTraefikSetup("::1");

		await initializeStandaloneTraefik();

		expect(createdPortBindings()?.["443/tcp"]).toEqual([
			{ HostIp: "::1", HostPort: "443" },
		]);
	});

	it("ignores TRAEFIK_HOST_IP for remote servers", async () => {
		const { initializeStandaloneTraefik } = await loadTraefikSetup("127.0.0.1");

		await initializeStandaloneTraefik({ serverId: "remote-server" });

		expect(mocks.getRemoteDocker).toHaveBeenCalledWith("remote-server");
		expect(createdPortBindings()?.["443/tcp"]).toEqual([{ HostPort: "443" }]);
	});

	it("does not validate TRAEFIK_HOST_IP for remote servers", async () => {
		const { initializeStandaloneTraefik } = await loadTraefikSetup("localhost");

		await initializeStandaloneTraefik({ serverId: "remote-server" });

		expect(createdPortBindings()?.["443/tcp"]).toEqual([{ HostPort: "443" }]);
	});

	it("rejects an invalid TRAEFIK_HOST_IP before touching the running container", async () => {
		const { initializeStandaloneTraefik } = await loadTraefikSetup("localhost");

		await expect(initializeStandaloneTraefik()).rejects.toThrow(
			"Invalid TRAEFIK_HOST_IP: localhost",
		);
		expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
		expect(mocks.remove).not.toHaveBeenCalled();
		expect(mocks.createContainer).not.toHaveBeenCalled();
	});
});
