import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleRouter } from "@/server/api/routers/schedule";

const mocks = vi.hoisted(() => ({
	checkServicePermissionAndAccess: vi.fn(),
	findServerById: vi.fn(),
	findScheduleById: vi.fn(),
	createSchedule: vi.fn(),
	updateSchedule: vi.fn(),
}));

// "@dokploy/server" and "@dokploy/server/index" resolve to the same module, so
// one mock serves both import paths used by the router.
vi.mock("@dokploy/server/index", () => ({
	IS_CLOUD: false,
	removeScheduleJob: vi.fn(),
	runCommand: vi.fn(),
	scheduleJob: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { schedules: { findMany: vi.fn(async () => []) } } },
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: vi.fn(async () => undefined),
	checkServicePermissionAndAccess: mocks.checkServicePermissionAndAccess,
	findMemberByUserId: vi.fn(async () => ({ role: "owner" })),
}));

vi.mock("@dokploy/server/services/schedule", () => ({
	assertHostScheduleAccess: vi.fn(async () => undefined),
	createSchedule: mocks.createSchedule,
	deleteSchedule: vi.fn(),
	findScheduleById: mocks.findScheduleById,
	updateSchedule: mocks.updateSchedule,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mocks.findServerById,
}));

vi.mock("@/server/api/utils/audit", () => ({
	audit: vi.fn(async () => undefined),
}));

vi.mock("@/server/api/utils/plan-limits", () => ({
	assertScheduledJobLimit: vi.fn(),
}));

vi.mock("@/server/utils/backup", () => ({
	removeJob: vi.fn(),
	schedule: vi.fn(),
	updateJob: vi.fn(),
}));

const caller = scheduleRouter.createCaller({
	session: { activeOrganizationId: "org-a" },
	user: { id: "user-1", email: "owner@example.com", role: "owner" },
} as Parameters<typeof scheduleRouter.createCaller>[0]);

const baseInput = {
	name: "job",
	cronExpression: "0 0 * * *",
	command: "echo hi",
	enabled: false,
};

describe("schedule targets must all belong to the caller", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkServicePermissionAndAccess.mockImplementation(
			async (_ctx: unknown, serviceId: string) => {
				if (serviceId.startsWith("foreign")) {
					throw Object.assign(new Error("forbidden"), {
						code: "UNAUTHORIZED",
					});
				}
			},
		);
		mocks.findServerById.mockImplementation(async (serverId: string) => ({
			serverId,
			organizationId: serverId.startsWith("foreign") ? "org-b" : "org-a",
		}));
		mocks.createSchedule.mockImplementation(async (input: object) => ({
			scheduleId: "schedule-1",
			...input,
		}));
		mocks.updateSchedule.mockImplementation(async (input: object) => ({
			...input,
		}));
	});

	it("rejects a compose schedule whose compose is hidden behind an accessible application", async () => {
		await expect(
			caller.create({
				...baseInput,
				scheduleType: "compose",
				applicationId: "app-own",
				composeId: "foreign-compose",
				serviceName: "web",
			}),
		).rejects.toThrow();
		expect(mocks.createSchedule).not.toHaveBeenCalled();
	});

	it("rejects an application schedule carrying a foreign server", async () => {
		await expect(
			caller.create({
				...baseInput,
				scheduleType: "application",
				applicationId: "app-own",
				serverId: "foreign-server",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.createSchedule).not.toHaveBeenCalled();
	});

	it("rejects retargeting an existing schedule at a foreign application", async () => {
		mocks.findScheduleById.mockResolvedValue({
			scheduleId: "schedule-1",
			scheduleType: "application",
			applicationId: "app-own",
			composeId: null,
			serverId: null,
			organizationId: null,
		});

		await expect(
			caller.update({
				...baseInput,
				scheduleId: "schedule-1",
				scheduleType: "application",
				applicationId: "foreign-app",
			}),
		).rejects.toThrow();
		expect(mocks.updateSchedule).not.toHaveBeenCalled();
	});

	it("rejects moving a server schedule to a server of another organization", async () => {
		mocks.findScheduleById.mockResolvedValue({
			scheduleId: "schedule-1",
			scheduleType: "server",
			applicationId: null,
			composeId: null,
			serverId: "server-own",
			organizationId: null,
		});

		await expect(
			caller.update({
				...baseInput,
				scheduleId: "schedule-1",
				scheduleType: "server",
				serverId: "foreign-server",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(mocks.updateSchedule).not.toHaveBeenCalled();
	});

	it("rejects running another organization's host schedule", async () => {
		mocks.findScheduleById.mockResolvedValue({
			scheduleId: "schedule-1",
			scheduleType: "dokploy-server",
			applicationId: null,
			composeId: null,
			serverId: null,
			organizationId: "org-b",
		});

		await expect(
			caller.runManually({ scheduleId: "schedule-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("creates a schedule for an accessible application", async () => {
		await caller.create({
			...baseInput,
			scheduleType: "application",
			applicationId: "app-own",
		});
		expect(mocks.createSchedule).toHaveBeenCalledTimes(1);
	});
});
