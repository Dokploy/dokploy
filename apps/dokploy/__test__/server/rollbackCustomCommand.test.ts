import { rollbackApplication } from "@dokploy/server/services/rollbacks";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockCreateServiceOptions = {
	TaskTemplate?: {
		ContainerSpec?: {
			Command?: string[];
			Args?: string[];
		};
	};
	[key: string]: unknown;
};

const { inspectMock, getServiceMock, createServiceMock, getRemoteDockerMock } =
	vi.hoisted(() => {
		const inspect = vi.fn<() => Promise<never>>();
		const getService = vi.fn(() => ({ inspect }));
		const createService = vi.fn<
			(opts: MockCreateServiceOptions) => Promise<void>
		>(async () => undefined);
		const getRemoteDocker = vi.fn(async () => ({
			getService,
			createService,
		}));
		return {
			inspectMock: inspect,
			getServiceMock: getService,
			createServiceMock: createService,
			getRemoteDockerMock: getRemoteDocker,
		};
	});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

type RollbackContext = Parameters<typeof rollbackApplication>[3];

const createContext = (
	overrides: Record<string, unknown> = {},
): RollbackContext =>
	({
		env: null,
		mounts: [],
		cpuLimit: null,
		memoryLimit: null,
		memoryReservation: null,
		cpuReservation: null,
		command: null,
		customCommand: null,
		customShell: null,
		ports: [],
		rollbackRegistry: null,
		environment: {
			project: { env: null },
			env: null,
		},
		...overrides,
	}) as unknown as RollbackContext;

const getContainerSpec = () => {
	expect(createServiceMock).toHaveBeenCalledTimes(1);
	const call = createServiceMock.mock.calls[0];
	if (!call) {
		throw new Error("createServiceMock should have been called once");
	}
	const [settings] = call;
	return settings.TaskTemplate?.ContainerSpec;
};

describe("rollbackApplication custom command", () => {
	beforeEach(() => {
		inspectMock.mockReset();
		inspectMock.mockRejectedValue(new Error("service not found"));
		getServiceMock.mockClear();
		createServiceMock.mockClear();
		getRemoteDockerMock.mockClear();
		getRemoteDockerMock.mockResolvedValue({
			getService: getServiceMock,
			createService: createServiceMock,
		});
	});

	it("uses sh -c script with no Args for custom sh context", async () => {
		const fullContext = createContext({
			command: "node server.js",
			customCommand: "npx prisma migrate deploy && node server.js",
			customShell: "sh",
		});

		await rollbackApplication(
			"test-app",
			"test-app:v1",
			"server-id",
			fullContext,
		);

		const containerSpec = getContainerSpec();
		expect(containerSpec?.Command).toEqual([
			"sh",
			"-c",
			"npx prisma migrate deploy && node server.js",
		]);
		expect(containerSpec?.Args).toBeUndefined();
	});

	it("uses bash -c script with no Args for custom bash context", async () => {
		const fullContext = createContext({
			command: "node server.js",
			customCommand: "php artisan migrate --force && apache2-foreground",
			customShell: "bash",
		});

		await rollbackApplication(
			"test-app",
			"test-app:v1",
			"server-id",
			fullContext,
		);

		const containerSpec = getContainerSpec();
		expect(containerSpec?.Command).toEqual([
			"bash",
			"-c",
			"php artisan migrate --force && apache2-foreground",
		]);
		expect(containerSpec?.Args).toBeUndefined();
	});

	it("keeps the legacy sh -c form for command-only context", async () => {
		const fullContext = createContext({
			command: "node server.js",
			customCommand: null,
		});

		await rollbackApplication(
			"test-app",
			"test-app:v1",
			"server-id",
			fullContext,
		);

		const containerSpec = getContainerSpec();
		expect(containerSpec?.Command).toEqual(["/bin/sh"]);
		expect(containerSpec?.Args).toEqual(["-c", "node server.js"]);
	});
});
