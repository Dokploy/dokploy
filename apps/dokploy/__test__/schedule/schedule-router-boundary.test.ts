import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	assertTargetServerAccess: vi.fn(),
	checkPermission: vi.fn(),
	checkServicePermissionAndAccess: vi.fn(),
	createSchedule: vi.fn(),
	deleteSchedule: vi.fn(),
	findMemberByUserId: vi.fn(),
	findScheduleById: vi.fn(),
	removeJob: vi.fn(),
	removeScheduleJob: vi.fn(),
	runCommand: vi.fn(),
	schedule: vi.fn(),
	scheduleJob: vi.fn(),
	updateSchedule: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	IS_CLOUD: false,
	removeScheduleJob: mocks.removeScheduleJob,
	scheduleJob: mocks.scheduleJob,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			schedules: {
				findMany: vi.fn(() => Promise.resolve([])),
			},
		},
	},
}));

vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	removeScheduleJob: mocks.removeScheduleJob,
	runCommand: mocks.runCommand,
	scheduleJob: mocks.scheduleJob,
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: mocks.checkPermission,
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
	findMemberByUserId: mocks.findMemberByUserId,
}));

vi.mock("@dokploy/server/services/schedule", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/services/schedule")>();
	return {
		...actual,
		createSchedule: mocks.createSchedule,
		deleteSchedule: mocks.deleteSchedule,
		findScheduleById: mocks.findScheduleById,
		updateSchedule: mocks.updateSchedule,
	};
});

vi.mock("@/server/api/utils/audit", () => ({
	audit: mocks.audit,
}));

vi.mock("@/server/api/utils/placement-access", () => ({
	assertTargetServerAccess: mocks.assertTargetServerAccess,
}));

vi.mock("@/server/utils/backup", () => ({
	removeJob: mocks.removeJob,
	schedule: mocks.schedule,
}));

const { scheduleRouter } = await import("../../server/api/routers/schedule");

const createCaller = () =>
	scheduleRouter.createCaller({
		user: { id: "user-1" },
		session: { activeOrganizationId: "org-1" },
	} as never);

const scheduleInput = {
	name: "nightly",
	cronExpression: "0 0 * * *",
	appName: "schedule-one",
	command: "echo ok",
	shellType: "bash" as const,
	enabled: true,
};

describe("schedule service/server binding boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkPermission.mockResolvedValue(undefined);
		mocks.checkServicePermissionAndAccess.mockResolvedValue(undefined);
		mocks.findMemberByUserId.mockResolvedValue({ role: "admin" });
		mocks.assertTargetServerAccess.mockResolvedValue(undefined);
		mocks.createSchedule.mockResolvedValue({
			...scheduleInput,
			scheduleId: "schedule-1",
			scheduleType: "application",
			applicationId: "app-1",
		});
		mocks.findScheduleById.mockResolvedValue({
			...scheduleInput,
			scheduleId: "schedule-1",
			scheduleType: "application",
			applicationId: "app-1",
			composeId: null,
			serverId: null,
			organizationId: null,
		});
		mocks.updateSchedule.mockResolvedValue({
			...scheduleInput,
			scheduleId: "schedule-1",
			scheduleType: "application",
			applicationId: "app-1",
		});
	});

	const mockForeignHostSchedule = () => {
		mocks.findScheduleById.mockResolvedValue({
			...scheduleInput,
			scheduleId: "host-schedule-1",
			scheduleType: "dokploy-server",
			applicationId: null,
			composeId: null,
			serverId: null,
			organizationId: "org-2",
		});
	};

	it("rejects creating a service-bound schedule as a server schedule", async () => {
		await expect(
			createCaller().create({
				...scheduleInput,
				scheduleType: "server",
				applicationId: "app-1",
				serverId: "server-1",
			}),
		).rejects.toThrow("Changing schedule service or server binding");

		expect(mocks.createSchedule).not.toHaveBeenCalled();
		expect(mocks.assertTargetServerAccess).not.toHaveBeenCalled();
	});

	it("sets the service schedule type from the service binding on create", async () => {
		await expect(
			createCaller().create({
				...scheduleInput,
				applicationId: "app-1",
			}),
		).resolves.toMatchObject({
			scheduleId: "schedule-1",
		});

		expect(mocks.createSchedule).toHaveBeenCalledWith(
			expect.objectContaining({
				applicationId: "app-1",
				scheduleType: "application",
			}),
		);
	});

	it("rejects converting an application schedule into a server schedule", async () => {
		await expect(
			createCaller().update({
				...scheduleInput,
				scheduleId: "schedule-1",
				scheduleType: "server",
				applicationId: null,
				serverId: "server-1",
			}),
		).rejects.toThrow("Changing schedule service or server binding");

		expect(mocks.updateSchedule).not.toHaveBeenCalled();
		expect(mocks.assertTargetServerAccess).not.toHaveBeenCalled();
	});

	it("allows updating mutable fields on an existing service schedule", async () => {
		await expect(
			createCaller().update({
				...scheduleInput,
				scheduleId: "schedule-1",
				name: "renamed",
			}),
		).resolves.toMatchObject({
			scheduleId: "schedule-1",
		});

		expect(mocks.updateSchedule).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "renamed",
				scheduleId: "schedule-1",
			}),
		);
	});

	it("rejects reading a host-level schedule from another organization by global id", async () => {
		mockForeignHostSchedule();

		await expect(
			createCaller().one({ scheduleId: "host-schedule-1" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(mocks.findMemberByUserId).not.toHaveBeenCalled();
	});

	it("rejects updating a host-level schedule from another organization before side effects", async () => {
		mockForeignHostSchedule();

		await expect(
			createCaller().update({
				...scheduleInput,
				scheduleId: "host-schedule-1",
				name: "renamed",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(mocks.updateSchedule).not.toHaveBeenCalled();
		expect(mocks.scheduleJob).not.toHaveBeenCalled();
	});

	it("rejects deleting a host-level schedule from another organization before side effects", async () => {
		mockForeignHostSchedule();

		await expect(
			createCaller().delete({ scheduleId: "host-schedule-1" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(mocks.deleteSchedule).not.toHaveBeenCalled();
		expect(mocks.removeScheduleJob).not.toHaveBeenCalled();
	});

	it("rejects running a host-level schedule from another organization before command execution", async () => {
		mockForeignHostSchedule();

		await expect(
			createCaller().runManually({ scheduleId: "host-schedule-1" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(mocks.runCommand).not.toHaveBeenCalled();
	});
});
