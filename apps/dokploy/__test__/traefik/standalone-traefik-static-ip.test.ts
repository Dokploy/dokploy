import {
	initializeStandaloneTraefik,
	initializeTraefikService,
	TRAEFIK_NETWORK_NAME,
} from "@dokploy/server/setup/traefik-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRemoteDocker: vi.fn() }));

vi.mock("@dokploy/server/db", () => ({ db: {} }));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));

interface FakeNetwork {
	subnet: string;
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
	network = { subnet: "10.0.1.0/24", containers: [] },
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
			containers.push({ id, name, running: false, env: [] });
			log.push(`create ${id}`);
			return container(id);
		},
		getNetwork: (name: string) => ({
			inspect: async () => ({
				Name: name,
				IPAM: {
					Driver: "default",
					Config: [{ Subnet: network.subnet }],
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

	it("does not treat the Traefik containers as a conflict", async () => {
		const fake = fakeDocker({
			network: {
				subnet: "10.0.1.0/24",
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

	it("reports an address outside the network subnet", async () => {
		const fake = fakeDocker();

		const error = await recreate(fake, {
			env: ["TRAEFIK_STATIC_IP=10.9.9.9"],
		});

		expect(error?.message).toContain(
			'TRAEFIK_STATIC_IP "10.9.9.9" is not inside the "dokploy-network" subnet (10.0.1.0/24)',
		);
		expect(fake.createdWith()).toBeUndefined();
	});

	it("reports an address that another container already uses", async () => {
		const fake = fakeDocker({
			network: {
				subnet: "10.0.1.0/24",
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
