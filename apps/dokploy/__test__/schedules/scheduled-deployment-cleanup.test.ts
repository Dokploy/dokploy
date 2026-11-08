import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleteDeployment: vi.fn(),
	findScheduleById: vi.fn(),
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@trpc/server", () => ({ TRPCError: Error }));
vi.mock("date-fns", () => ({ format: vi.fn() }));
vi.mock("@dokploy/server/constants", () => ({ paths: vi.fn() }));
vi.mock("@dokploy/server/db", () => ({
	db: {
		delete: () => ({
			where: () => ({ returning: mocks.deleteDeployment }),
		}),
	},
}));
vi.mock("@dokploy/server/db/schema", () => ({
	applications: {},
	compose: {},
	deployments: {},
	environments: {},
	projects: {},
}));
vi.mock("@dokploy/server/db/schema/schedule", () => ({ schedules: {} }));
vi.mock("@dokploy/server/utils/docker/utils", () => ({
	encodeBase64: vi.fn(),
}));
vi.mock("@dokploy/server/services/permission", () => ({
	findMemberByUserId: vi.fn(),
}));
vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryIfExistsContent: vi.fn(),
}));
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));
vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
	updateApplicationStatus: vi.fn(),
}));
vi.mock("@dokploy/server/services/backup", () => ({
	findBackupById: vi.fn(),
}));
vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: vi.fn(),
	updateCompose: vi.fn(),
}));
vi.mock("@dokploy/server/services/preview-deployment", () => ({
	findPreviewDeploymentById: vi.fn(),
	updatePreviewDeployment: vi.fn(),
}));
vi.mock("@dokploy/server/services/rollbacks", () => ({
	removeRollbackById: vi.fn(),
}));
vi.mock("@dokploy/server/services/schedule", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/services/schedule")
	>()),
	findScheduleById: mocks.findScheduleById,
}));
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));
vi.mock("@dokploy/server/services/volume-backups", () => ({
	findVolumeBackupById: vi.fn(),
}));

const { removeDeployment } = await import(
	"@dokploy/server/services/deployment"
);

beforeEach(() => {
	vi.resetAllMocks();
	mocks.deleteDeployment.mockResolvedValue([
		{
			deploymentId: "run-1",
			scheduleId: "schedule-1",
			serverId: null,
			logPath: "/logs/schedule/run.log",
		},
	]);
});

describe("scheduled deployment cleanup", () => {
	it.each([
		"application",
		"compose",
		"postgres",
		"mysql",
		"mariadb",
		"mongo",
		"redis",
		"libsql",
	] as const)(
		"removes remote %s schedule logs on the service server",
		async (type) => {
			const schedule = {
				scheduleId: "schedule-1",
				[type]: { serverId: "service-server" },
			};
			mocks.findScheduleById.mockResolvedValue(schedule);

			await removeDeployment("run-1");

			expect(mocks.findScheduleById).toHaveBeenCalledWith("schedule-1");
			expect(mocks.execAsyncRemote).toHaveBeenCalledExactlyOnceWith(
				"service-server",
				"rm -f /logs/schedule/run.log;",
			);
			expect(mocks.execAsync).not.toHaveBeenCalled();
		},
	);

	it("keeps local schedule log cleanup local", async () => {
		mocks.findScheduleById.mockResolvedValue({ scheduleId: "schedule-1" });

		await removeDeployment("run-1");

		expect(mocks.execAsync).toHaveBeenCalledExactlyOnceWith(
			"rm -f /logs/schedule/run.log;",
		);
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("keeps explicit deployment server routing", async () => {
		mocks.deleteDeployment.mockResolvedValue([
			{
				deploymentId: "run-1",
				serverId: "deployment-server",
				logPath: "/logs/deployment.log",
			},
		]);

		await removeDeployment("run-1");

		expect(mocks.findScheduleById).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).toHaveBeenCalledExactlyOnceWith(
			"deployment-server",
			"rm -f /logs/deployment.log;",
		);
	});

	it("does not execute cleanup for a missing log path", async () => {
		mocks.deleteDeployment.mockResolvedValue([
			{ deploymentId: "run-1", scheduleId: "schedule-1", logPath: "" },
		]);

		await removeDeployment("run-1");

		expect(mocks.findScheduleById).not.toHaveBeenCalled();
		expect(mocks.execAsync).not.toHaveBeenCalled();
		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});
});
