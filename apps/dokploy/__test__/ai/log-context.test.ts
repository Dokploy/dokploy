import { Readable } from "node:stream";
import {
	belongsToService,
	resolveLogContext,
	sourceLocation,
} from "@dokploy/server/services/ai-log-context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	rows: [] as unknown[][],
	deployment: vi.fn(),
	permission: vi.fn(),
	servicePermission: vi.fn(),
	server: vi.fn(),
	accessible: vi.fn(),
	openFiles: vi.fn(),
	inspect: vi.fn(),
	taskInspect: vi.fn(),
	dial: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => {
	const chain = {
		innerJoin: () => chain,
		where: async () => mocks.rows.shift() || [],
	};
	return {
		db: {
			select: () => ({ from: () => chain }),
			query: { deployments: { findFirst: mocks.deployment } },
		},
	};
});
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.permission,
	checkServicePermissionAndAccess: mocks.servicePermission,
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.server,
	getAccessibleServerIds: mocks.accessible,
}));
vi.mock("@dokploy/server/utils/ai/file-access", () => ({
	openFiles: mocks.openFiles,
}));
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: async () => ({
		getContainer: () => ({ inspect: mocks.inspect }),
		getService: () => ({ inspect: mocks.inspect }),
		getTask: () => ({ inspect: mocks.taskInspect }),
		modem: {
			dial: mocks.dial,
			demuxStream: (stream: Readable, output: NodeJS.WritableStream) =>
				stream.pipe(output),
		},
	}),
}));

const ctx = { user: { id: "u" }, session: { activeOrganizationId: "org" } };
const app = {
	appName: "app",
	serverId: null,
	buildServerId: null,
	organizationId: "org",
	sourceType: "github",
};
const runtime = {
	type: "runtime" as const,
	runType: "native" as const,
	containerId: "container",
	serviceId: "app-id",
};
const fileAccess = {
	realpath: vi.fn(async (value: string) => value),
	lstat: vi.fn(async () => ({ size: 10, isFile: () => true })),
	read: vi.fn(async () => Buffer.from("old\nerror\n")),
	close: vi.fn(),
};
beforeEach(() => {
	vi.clearAllMocks();
	mocks.rows = [[app]];
	mocks.permission.mockResolvedValue(undefined);
	mocks.servicePermission.mockResolvedValue(undefined);
	mocks.server.mockResolvedValue({
		organizationId: "org",
		sshKey: { privateKey: "test" },
	});
	mocks.accessible.mockResolvedValue(new Set(["remote", "builder"]));
	mocks.inspect.mockResolvedValue({
		Name: "/app",
		Config: { Tty: true, Labels: { "com.docker.swarm.service.name": "app" } },
	});
	mocks.dial.mockImplementation((_options, callback) =>
		callback(null, Readable.from([Buffer.from("error\nlast\n")])),
	);
	mocks.openFiles.mockResolvedValue(fileAccess);
	mocks.deployment.mockResolvedValue({
		deploymentId: "d",
		applicationId: "app-id",
		logPath: `${process.cwd()}/.docker/logs/app/build.log`,
	});
});

describe("log target resolution", () => {
	it("allows dotted checkout names without allowing parent paths", () => {
		expect(
			sourceLocation({
				...app,
				appName: "my.app",
				id: "app",
				sourceKind: "application",
			})?.directory,
		).toContain("applications/my.app/code");
		expect(() =>
			sourceLocation({
				...app,
				appName: "..",
				id: "app",
				sourceKind: "application",
			}),
		).toThrow("Invalid");
	});
	it("resolves Swarm task IDs from the log selectors and checks their owning service", async () => {
		mocks.inspect
			.mockRejectedValueOnce({ statusCode: 404 })
			.mockResolvedValueOnce({
				Spec: {
					Name: "app",
					Labels: {},
					TaskTemplate: { ContainerSpec: { TTY: true } },
				},
			});
		mocks.taskInspect.mockResolvedValue({ ServiceID: "swarm-service-id" });
		await resolveLogContext(
			ctx,
			{ ...runtime, runType: "swarm", containerId: "task-id" },
			200,
		);
		expect(mocks.dial.mock.calls[0]?.[0].path).toBe("/tasks/task-id/logs?");
	});
	it("does not resolve a build server when source inspection is disabled", async () => {
		mocks.rows = [[{ ...app, buildServerId: "inaccessible-builder" }]];
		const result = await resolveLogContext(ctx, runtime, 200, false);
		expect(result.source).toBeUndefined();
		expect(mocks.server).not.toHaveBeenCalled();
	});
	it("does not inspect stale checkouts for applications deployed from Docker images", async () => {
		mocks.rows = [[{ ...app, sourceType: "docker" }]];
		const result = await resolveLogContext(ctx, runtime, 200, true);
		expect(result.source).toBeUndefined();
	});
	it("fetches a finite runtime tail independently of viewer filters", async () => {
		const result = await resolveLogContext(ctx, runtime, 750, true);
		expect(result.logs).toBe("error\nlast\n");
		expect(mocks.dial.mock.calls[0]?.[0]).toMatchObject({
			isStream: true,
			options: { follow: false, tail: 750, stdout: true, stderr: true },
		});
		expect(result.source?.directory).toContain("applications/app/code");
	});
	it("rejects a different organization's service before container inspection", async () => {
		mocks.rows = [[{ ...app, organizationId: "other" }]];
		await expect(resolveLogContext(ctx, runtime, 200)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.inspect).not.toHaveBeenCalled();
	});
	it("rejects a container that does not belong to the supplied service", async () => {
		mocks.inspect.mockResolvedValue({
			Name: "/other",
			Config: { Tty: true, Labels: {} },
		});
		await expect(resolveLogContext(ctx, runtime, 200)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mocks.dial).not.toHaveBeenCalled();
	});
	it("rejects mismatched servers", async () => {
		await expect(
			resolveLogContext(ctx, { ...runtime, serverId: "other" }, 200),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mocks.inspect).not.toHaveBeenCalled();
	});
	it("uses Docker permissions for generic targets and omits source access", async () => {
		const result = await resolveLogContext(
			ctx,
			{ ...runtime, serviceId: undefined },
			200,
		);
		expect(mocks.permission).toHaveBeenCalledWith(ctx, { docker: ["read"] });
		expect(result.source).toBeUndefined();
	});
	it("denies inaccessible generic remote servers", async () => {
		mocks.accessible.mockResolvedValue(new Set());
		await expect(
			resolveLogContext(
				ctx,
				{ ...runtime, serviceId: undefined, serverId: "remote" },
				200,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
	it("reads deployment logs from their recorded build server and resolves preview source", async () => {
		mocks.rows = [[{ ...app, serverId: "remote", buildServerId: "builder" }]];
		mocks.deployment.mockResolvedValue({
			applicationId: "app-id",
			buildServerId: "builder",
			previewDeployment: { appName: "app-preview" },
			logPath: "/etc/dokploy/logs/app/build.log",
		});
		const result = await resolveLogContext(
			ctx,
			{ type: "deployment", deploymentId: "d" },
			200,
			true,
		);
		expect(mocks.openFiles).toHaveBeenCalledWith("builder");
		expect(result.source).toEqual({
			directory: "/etc/dokploy/applications/app-preview/code",
			serverId: "builder",
		});
		expect(fileAccess.close).toHaveBeenCalled();
	});
	it("does not permit a deployment path outside the logs directory", async () => {
		mocks.deployment.mockResolvedValue({
			applicationId: "app-id",
			logPath: "/etc/passwd",
		});
		await expect(
			resolveLogContext(ctx, { type: "deployment", deploymentId: "d" }, 200),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(fileAccess.read).not.toHaveBeenCalled();
	});
	it("resolves Compose source and validates stack ownership", async () => {
		mocks.rows = [[], [{ ...app, appName: "compose-project" }]];
		mocks.inspect.mockResolvedValue({
			Spec: {
				Name: "compose-project_web",
				Labels: { "com.docker.stack.namespace": "compose-project" },
				TaskTemplate: { ContainerSpec: { TTY: true } },
			},
		});
		const result = await resolveLogContext(
			ctx,
			{ ...runtime, runType: "swarm" },
			200,
			true,
		);
		expect(result.source?.directory).toContain("compose/compose-project/code");
		expect(mocks.dial.mock.calls[0]?.[0].path).toContain("/services/");
	});
	it("supports Compose labels and excludes source for database services", () => {
		expect(
			belongsToService({ "com.docker.compose.project": "app" }, "app_web_1", {
				appName: "app",
				sourceKind: "compose",
			}),
		).toBe(true);
		expect(
			sourceLocation({ ...app, id: "db", sourceKind: null }),
		).toBeUndefined();
	});
});
