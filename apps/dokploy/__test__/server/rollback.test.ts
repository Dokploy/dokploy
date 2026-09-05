import path from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Mount } from "@dokploy/server/services/mount";
import { rollbackApplication } from "@dokploy/server/services/rollbacks";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FullContext = NonNullable<Parameters<typeof rollbackApplication>[3]>;

type MountEntry = { Type: string; Source: string; Target: string };

type MockCreateServiceOptions = {
	TaskTemplate?: {
		ContainerSpec?: {
			Mounts?: MountEntry[];
		};
	};
	[key: string]: unknown;
};

const {
	inspectMock,
	getServiceMock,
	createServiceMock,
	updateMock,
	getRemoteDockerMock,
} = vi.hoisted(() => {
	const inspect = vi.fn<() => Promise<unknown>>();
	const update = vi.fn<(opts: MockCreateServiceOptions) => Promise<void>>(
		async () => undefined,
	);
	const getService = vi.fn(() => ({ inspect, update }));
	const createService = vi.fn<
		(opts: MockCreateServiceOptions) => Promise<void>
	>(async () => undefined);
	const getRemoteDocker = vi.fn(async () => ({ getService, createService }));
	return {
		inspectMock: inspect,
		getServiceMock: getService,
		createServiceMock: createService,
		updateMock: update,
		getRemoteDockerMock: getRemoteDocker,
	};
});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const APP_NAME = "test-app";

const asMount = (mount: Partial<Mount>): Mount => mount as unknown as Mount;

const createContext = (overrides: Partial<FullContext> = {}): FullContext =>
	({
		env: null,
		mounts: [],
		cpuLimit: null,
		memoryLimit: null,
		memoryReservation: null,
		cpuReservation: null,
		command: null,
		ports: [],
		serverId: "server-id",
		replicas: 1,
		environment: {
			environmentId: "env-id",
			env: null,
			project: {
				projectId: "project-id",
				organizationId: "org-id",
				env: null,
			},
		},
		...overrides,
	}) as unknown as FullContext;

const buildMounts = (): Mount[] => [
	asMount({
		mountId: "mount-bind",
		type: "bind",
		hostPath: "/host/bind-data",
		mountPath: "/app/bind-data",
		serviceType: "application",
	}),
	asMount({
		mountId: "mount-volume",
		type: "volume",
		volumeName: "my-volume",
		mountPath: "/app/volume-data",
		serviceType: "application",
	}),
	asMount({
		mountId: "mount-file",
		type: "file",
		filePath: "config.yaml",
		mountPath: "/app/config.yaml",
		serviceType: "application",
	}),
];

const expectedFileSource = (
	filePath: string,
	serverId?: string | null,
): string => {
	const { APPLICATIONS_PATH } = paths(!!serverId);
	return path.join(
		path.resolve(APPLICATIONS_PATH),
		APP_NAME,
		"files",
		filePath,
	);
};

const getMounts = (call: readonly unknown[] | undefined): MountEntry[] => {
	const settings = call?.[0] as MockCreateServiceOptions | undefined;
	return settings?.TaskTemplate?.ContainerSpec?.Mounts ?? [];
};

describe("rollbackApplication mounts", () => {
	beforeEach(() => {
		inspectMock.mockReset();
		inspectMock.mockRejectedValue(new Error("service not found"));
		getServiceMock.mockClear();
		createServiceMock.mockClear();
		updateMock.mockClear();
		getRemoteDockerMock.mockClear();
		getRemoteDockerMock.mockResolvedValue({
			getService: getServiceMock,
			createService: createServiceMock,
		});
	});

	it("includes file-type mounts in ContainerSpec.Mounts on the createService branch", async () => {
		const context = createContext({ mounts: buildMounts() });

		await rollbackApplication(APP_NAME, "test-app:v1", "server-id", context);

		expect(createServiceMock).toHaveBeenCalledTimes(1);
		expect(updateMock).not.toHaveBeenCalled();
		const mounts = getMounts(createServiceMock.mock.calls[0]);
		expect(mounts).toHaveLength(3);
		expect(mounts).toContainEqual({
			Type: "volume",
			Source: "my-volume",
			Target: "/app/volume-data",
		});
		expect(mounts).toContainEqual({
			Type: "bind",
			Source: "/host/bind-data",
			Target: "/app/bind-data",
		});
		expect(mounts).toContainEqual({
			Type: "bind",
			Source: expectedFileSource("config.yaml", "server-id"),
			Target: "/app/config.yaml",
		});
	});

	it("includes file-type mounts in ContainerSpec.Mounts on the service.update branch", async () => {
		// service.update sends a full ServiceSpec that replaces the prior spec
		// wholesale, so file mounts must be present in the update payload too.
		inspectMock.mockReset();
		inspectMock.mockResolvedValue({
			Version: { Index: 7 },
			Spec: { TaskTemplate: { ForceUpdate: 0 } },
		});

		const context = createContext({ mounts: buildMounts() });

		await rollbackApplication(APP_NAME, "test-app:v1", "server-id", context);

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(createServiceMock).not.toHaveBeenCalled();
		const mounts = getMounts(updateMock.mock.calls[0]);
		expect(mounts).toHaveLength(3);
		expect(mounts).toContainEqual({
			Type: "bind",
			Source: expectedFileSource("config.yaml", "server-id"),
			Target: "/app/config.yaml",
		});
	});

	it("resolves file mount source against the local applications path", async () => {
		const context = createContext({
			mounts: buildMounts(),
			serverId: null,
		});

		await rollbackApplication(APP_NAME, "test-app:v1", null, context);

		const mounts = getMounts(createServiceMock.mock.calls[0]);
		expect(mounts).toContainEqual({
			Type: "bind",
			Source: expectedFileSource("config.yaml", null),
			Target: "/app/config.yaml",
		});
	});
});
