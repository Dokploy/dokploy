import {
	initializeStandaloneTraefik,
	initializeTraefikService,
	TRAEFIK_NETWORK_NAME,
	validateTraefikStaticIp,
} from "@dokploy/server/setup/traefik-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRemoteDocker: vi.fn() }));

vi.mock("@dokploy/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

interface FakeNetwork {
	driver?: "bridge" | "overlay";
	subnets: string[];
	containers: { Name: string; IPv4Address: string }[];
}

interface FakeOptions {
	oldRunning?: boolean | null;
	oldEnv?: string[];
	network?: FakeNetwork;
}

const fakeDocker = ({
	oldRunning = true,
	oldEnv = [],
	network = { subnets: ["10.0.1.0/24"], containers: [] },
}: FakeOptions = {}) => {
	const log: string[] = [];
	const containers: {
		id: string;
		name: string;
		running: boolean;
		env: string[];
	}[] = [];
	if (oldRunning !== null) {
		containers.push({
			id: "old",
			name: "dokploy-traefik",
			running: oldRunning,
			env: oldEnv,
		});
	}
	let created = 0;
	let createdWith: Record<string, unknown> | undefined;

	const find = (ref: string) => {
		const found = containers.find((c) => c.id === ref || c.name === ref);
		if (!found) throw new Error(`No such container: ${ref}`);
		return found;
	};

	const container = (ref: string) => ({
		inspect: async () => {
			const c = find(ref);
			return {
				Id: c.id,
				State: { Running: c.running, StartedAt: "steady" },
				Config: { Env: c.env },
			};
		},
		rename: async ({ name }: { name: string }) => {
			const c = find(ref);
			log.push(`rename ${c.id} -> ${name}`);
			c.name = name;
		},
		stop: async () => {
			const c = find(ref);
			log.push(`stop ${c.id}`);
			c.running = false;
		},
		start: async () => {
			const c = find(ref);
			log.push(`start ${c.id}`);
			c.running = true;
		},
		remove: async () => {
			const c = find(ref);
			log.push(`remove ${c.id}`);
			containers.splice(containers.indexOf(c), 1);
		},
		logs: async () => Buffer.from(""),
	});

	const docker = {
		getImage: () => ({
			inspect: async () => ({}),
		}),
		pull: async () => "stream",
		modem: {
			followProgress: (
				_stream: unknown,
				done: (error: Error | null, events: unknown[]) => void,
			) => {
				done(null, []);
			},
		},
		getContainer: (ref: string) => container(ref),
		createContainer: async (settings: Record<string, unknown>) => {
			const name = settings.name as string;
			if (containers.some((c) => c.name === name)) {
				throw new Error(`Conflict: ${name} is already in use`);
			}
			createdWith = settings;
			created += 1;
			const id = created === 1 ? "new" : `new${created}`;
			containers.push({
				id,
				name,
				running: false,
				env: (settings.Env as string[] | undefined) ?? [],
			});
			log.push(`create ${id}`);
			return container(id);
		},
		getNetwork: (name: string) => ({
			inspect: async () => ({
				Name: name,
				Driver: network.driver ?? "bridge",
				IPAM: {
					Driver: "default",
					Config: network.subnets.map((Subnet) => ({ Subnet })),
				},
				Containers: Object.fromEntries(
					network.containers.map((entry, index) => [
						String(index),
						{
							Name: entry.Name,
							IPv4Address: entry.IPv4Address,
							IPv6Address: "",
							EndpointID: `endpoint-${index}`,
							MacAddress: `mac-${index}`,
						},
					]),
				),
			}),
		}),
	};

	return {
		docker,
		log,
		containers,
		createdWith: () => createdWith,
	};
};

const recreate = async (
	fake: ReturnType<typeof fakeDocker>,
	options: Parameters<typeof initializeStandaloneTraefik>[0] = {},
) => {
	mocks.getRemoteDocker.mockResolvedValue(fake.docker);
	const result = initializeStandaloneTraefik(options).then(
		() => null,
		(error: Error) => error,
	);
	await vi.runAllTimersAsync();
	return result;
};

const endpointOf = (fake: ReturnType<typeof fakeDocker>) => {
	const created = fake.createdWith() as
		| {
				NetworkingConfig: {
					EndpointsConfig: Record<
						string,
						{ IPAMConfig?: { IPv4Address?: string } }
					>;
				};
		  }
		| undefined;
	return created?.NetworkingConfig.EndpointsConfig[TRAEFIK_NETWORK_NAME];
};

const envOf = (fake: ReturnType<typeof fakeDocker>) =>
	(fake.createdWith() as { Env?: string[] } | undefined)?.Env;

describe("initializeStandaloneTraefik with TRAEFIK_STATIC_IP", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("pins the container to the configured address", async () => {
		const fake = fakeDocker();

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=10.0.1.45"],
		});

		expect(error).toBeNull();
		expect(endpointOf(fake)).toEqual({
			IPAMConfig: { IPv4Address: "10.0.1.45" },
		});
	});

	it("leaves the endpoint untouched when no address is configured", async () => {
		const fake = fakeDocker();

		const error = await recreate(fake, { env: [] });

		expect(error).toBeNull();
		expect(endpointOf(fake)).toEqual({});
	});

	it("inherits the address from the running container when no env is passed", async () => {
		const fake = fakeDocker({ oldEnv: ["TRAEFIK_STATIC_IP=10.0.1.45"] });

		const error = await recreate(fake);

		expect(error).toBeNull();
		expect(endpointOf(fake)).toEqual({
			IPAMConfig: { IPv4Address: "10.0.1.45" },
		});
	});

	it("keeps the address over two consecutive recreates", async () => {
		const fake = fakeDocker({ oldEnv: ["TRAEFIK_STATIC_IP=10.0.1.45"] });

		const first = await recreate(fake);
		expect(first).toBeNull();
		expect(endpointOf(fake)).toEqual({
			IPAMConfig: { IPv4Address: "10.0.1.45" },
		});
		// The replacement container has to keep the setting, otherwise the next
		// recreate would pin it once and drop it afterwards.
		expect(envOf(fake)).toEqual(["TRAEFIK_STATIC_IP=10.0.1.45"]);

		const second = await recreate(fake);
		expect(second).toBeNull();
		expect(endpointOf(fake)).toEqual({
			IPAMConfig: { IPv4Address: "10.0.1.45" },
		});
		expect(envOf(fake)).toEqual(["TRAEFIK_STATIC_IP=10.0.1.45"]);
	});

	it("accepts an address in a network with several IPv4 subnets", async () => {
		const fake = fakeDocker({
			network: { subnets: ["10.0.1.0/24", "10.0.2.0/24"], containers: [] },
		});

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=10.0.2.45"],
		});

		expect(error).toBeNull();
		expect(endpointOf(fake)).toEqual({
			IPAMConfig: { IPv4Address: "10.0.2.45" },
		});
	});

	it("accepts an address on a dual-stack network with the IPv6 subnet first", async () => {
		const fake = fakeDocker({
			network: {
				subnets: ["fd00::/64", "10.0.1.0/24"],
				containers: [],
			},
		});

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=10.0.1.45"],
		});

		expect(error).toBeNull();
		expect(endpointOf(fake)).toEqual({
			IPAMConfig: { IPv4Address: "10.0.1.45" },
		});
	});

	it("does not treat the Traefik containers as a conflict", async () => {
		const fake = fakeDocker({
			network: {
				subnets: ["10.0.1.0/24"],
				containers: [
					{ Name: "dokploy-traefik", IPv4Address: "10.0.1.45/24" },
					{
						Name: "dokploy-traefik-previous",
						IPv4Address: "10.0.1.45/24",
					},
				],
			},
		});

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=10.0.1.45"],
		});

		expect(error).toBeNull();
		expect(endpointOf(fake)).toEqual({
			IPAMConfig: { IPv4Address: "10.0.1.45" },
		});
	});

	it("reports an invalid address and leaves the running container alone", async () => {
		const fake = fakeDocker();

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=not-an-address"],
		});

		expect(error?.message).toContain(
			'TRAEFIK_STATIC_IP "not-an-address" is not a valid IPv4 address',
		);
		expect(fake.log).toEqual([]);
		expect(fake.createdWith()).toBeUndefined();
	});

	it("reports an address outside the network subnets", async () => {
		const fake = fakeDocker();

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=10.9.9.9"],
		});

		expect(error?.message).toContain(
			'TRAEFIK_STATIC_IP "10.9.9.9" is not inside the "dokploy-network" network (10.0.1.0/24)',
		);
		expect(fake.createdWith()).toBeUndefined();
	});

	it("reports an address that another container already uses", async () => {
		const fake = fakeDocker({
			network: {
				subnets: ["10.0.1.0/24"],
				containers: [{ Name: "some-app", IPv4Address: "10.0.1.45/24" }],
			},
		});

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=10.0.1.45"],
		});

		expect(error?.message).toContain(
			'TRAEFIK_STATIC_IP "10.0.1.45" is already used by the container "some-app"',
		);
		expect(fake.createdWith()).toBeUndefined();
	});

	it("explains the overlay caveat when the address is taken", async () => {
		const fake = fakeDocker({
			network: {
				driver: "overlay",
				subnets: ["10.0.1.0/24"],
				containers: [{ Name: "some-task.1", IPv4Address: "10.0.1.45/24" }],
			},
		});

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=10.0.1.45"],
		});

		expect(error?.message).toContain(
			"On an overlay network a swarm task can be given the same address after a reboot",
		);
	});

	it("warns on an overlay network that a task can take the address", async () => {
		const log = vi.spyOn(console, "log");
		const fake = fakeDocker({
			network: {
				driver: "overlay",
				subnets: ["10.0.1.0/24"],
				containers: [],
			},
		});

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=10.0.1.45"],
		});

		expect(error).toBeNull();
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("is an overlay network"),
		);
	});

	it("does not warn on a bridge network", async () => {
		const log = vi.spyOn(console, "log");
		const fake = fakeDocker({
			network: {
				driver: "bridge",
				subnets: ["10.0.1.0/24"],
				containers: [],
			},
		});

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=10.0.1.45"],
		});

		expect(error).toBeNull();
		expect(log).not.toHaveBeenCalledWith(
			expect.stringContaining("is an overlay network"),
		);
	});
});

describe("the TRAEFIK_STATIC_IP process default", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.resetModules();
	});

	it("applies it on the startup path, which passes no env", async () => {
		vi.stubEnv("TRAEFIK_STATIC_IP", "10.0.1.99");
		vi.resetModules();
		const { initializeStandaloneTraefik } = await import(
			"@dokploy/server/setup/traefik-setup"
		);
		const fake = fakeDocker({ oldEnv: [] });

		mocks.getRemoteDocker.mockResolvedValue(fake.docker);
		const result = initializeStandaloneTraefik().then(
			() => null,
			(error: Error) => error,
		);
		await vi.runAllTimersAsync();

		expect(await result).toBeNull();
		expect(endpointOf(fake)).toEqual({
			IPAMConfig: { IPv4Address: "10.0.1.99" },
		});
	});

	it("does not apply it when an env is given without the key", async () => {
		vi.stubEnv("TRAEFIK_STATIC_IP", "10.0.1.99");
		vi.resetModules();
		const { initializeStandaloneTraefik } = await import(
			"@dokploy/server/setup/traefik-setup"
		);
		const fake = fakeDocker();

		mocks.getRemoteDocker.mockResolvedValue(fake.docker);
		const result = initializeStandaloneTraefik({ env: [] }).then(
			() => null,
			(error: Error) => error,
		);
		await vi.runAllTimersAsync();

		expect(await result).toBeNull();
		expect(endpointOf(fake)).toEqual({});
	});
});

describe("validateTraefikStaticIp", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("accepts a valid address", async () => {
		mocks.getRemoteDocker.mockResolvedValue(fakeDocker().docker);

		await expect(
			validateTraefikStaticIp({ env: ["TRAEFIK_STATIC_IP=10.0.1.45"] }),
		).resolves.toBeUndefined();
	});

	it("does nothing when no address is configured", async () => {
		mocks.getRemoteDocker.mockResolvedValue(fakeDocker().docker);

		await expect(validateTraefikStaticIp({ env: [] })).resolves.toBeUndefined();
	});

	it("reports a wrong address before it is stored", async () => {
		mocks.getRemoteDocker.mockResolvedValue(fakeDocker().docker);

		await expect(
			validateTraefikStaticIp({ env: ["TRAEFIK_STATIC_IP=10.9.9.9"] }),
		).rejects.toThrow(
			'TRAEFIK_STATIC_IP "10.9.9.9" is not inside the "dokploy-network" network (10.0.1.0/24)',
		);
	});
});

describe("initializeTraefikService with TRAEFIK_STATIC_IP", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("rejects the setting instead of ignoring it", async () => {
		mocks.getRemoteDocker.mockResolvedValue(fakeDocker().docker);

		await expect(
			initializeTraefikService({ env: ["TRAEFIK_STATIC_IP=10.0.1.45"] }),
		).rejects.toThrow("TRAEFIK_STATIC_IP is not supported in swarm mode");
	});
});
