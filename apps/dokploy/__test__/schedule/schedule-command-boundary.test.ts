import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createDeploymentSchedule: vi.fn(),
	execAsyncRemote: vi.fn(),
	findScheduleById: vi.fn(),
	getComposeContainer: vi.fn(),
	getServiceContainer: vi.fn(),
	spawnAsync: vi.fn(),
	updateDeployment: vi.fn(),
	updateDeploymentStatus: vi.fn(),
}));

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
	paths: (remote = false) => ({
		SCHEDULES_PATH: remote ? "/remote schedules" : "/local schedules",
	}),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	createDeploymentSchedule: mocks.createDeploymentSchedule,
	updateDeployment: mocks.updateDeployment,
	updateDeploymentStatus: mocks.updateDeploymentStatus,
}));

vi.mock("@dokploy/server/services/schedule", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/services/schedule")>();
	return {
		...actual,
		findScheduleById: mocks.findScheduleById,
	};
});

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	encodeBase64: (value: string) => Buffer.from(value).toString("base64"),
	getComposeContainer: mocks.getComposeContainer,
	getServiceContainer: mocks.getServiceContainer,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
}));

vi.mock("@dokploy/server/utils/process/spawnAsync", () => ({
	spawnAsync: mocks.spawnAsync,
}));

vi.mock("node-schedule", () => ({
	scheduledJobs: {},
	scheduleJob: vi.fn(),
}));

const {
	buildDeleteScheduleCommand,
	buildScheduleScriptCommand,
	getScheduleDeploymentLogPath,
	getScheduleDirectory,
} = await import("@dokploy/server/services/schedule");
const { runCommand } = await import("@dokploy/server/utils/schedules/utils");

describe("schedule command boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createDeploymentSchedule.mockResolvedValue({
			deploymentId: "deployment-1",
			logPath: "/tmp/deployment log;id.log",
		});
		mocks.execAsyncRemote.mockResolvedValue({ stdout: "", stderr: "" });
		mocks.getServiceContainer.mockResolvedValue({ Id: "container-one" });
	});

	it("quotes remote application docker exec command and log paths", async () => {
		mocks.findScheduleById.mockResolvedValue({
			application: { appName: "app-one", serverId: "server-1" },
			command: "echo 'done'; touch /tmp/pwn $(id)",
			shellType: "bash",
			scheduleType: "application",
		});

		await expect(runCommand("schedule-1")).resolves.toBeUndefined();

		const command = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		expect(command).toContain(
			"docker exec container-one bash -c \"echo 'done'; touch /tmp/pwn \\$(id)\"",
		);
		expect(command).toContain(
			"Running schedule command for application container container-one",
		);
		expect(command).not.toContain("Running command:");
		expect(command).toContain(">> '/tmp/deployment log;id.log'");
		expect(command).not.toMatch(/(^|[^\\])\$\(/);
		expect(command).not.toContain("bash -c 'echo 'done'; touch /tmp/pwn");
	});

	it("quotes remote server schedule script and log paths", async () => {
		mocks.findScheduleById.mockResolvedValue({
			appName: "schedule-one",
			command: "",
			serverId: "server-1",
			shellType: "bash",
			scheduleType: "server",
		});

		await expect(runCommand("schedule-1")).resolves.toBeUndefined();

		const command = mocks.execAsyncRemote.mock.calls[0]?.[1] as string;
		expect(command).toContain(
			"bash '/remote schedules/schedule-one/script.sh'",
		);
		expect(command).toContain("tee -a '/tmp/deployment log;id.log'");
	});

	it("rejects unsafe stored schedule app names before remote script execution", async () => {
		mocks.findScheduleById.mockResolvedValue({
			appName: "schedule;id",
			command: "",
			serverId: "server-1",
			shellType: "bash",
			scheduleType: "server",
		});

		await expect(runCommand("schedule-1")).rejects.toThrow(
			"Invalid schedule app name",
		);

		expect(mocks.execAsyncRemote).not.toHaveBeenCalled();
	});

	it("quotes schedule create and delete filesystem commands", () => {
		const scriptCommand = buildScheduleScriptCommand("/srv schedules", {
			appName: "schedule-one",
			scheduleId: "schedule-1",
			script: "echo 'done'; touch /tmp/pwn",
		} as never);
		const deleteCommand = buildDeleteScheduleCommand(
			"/srv schedules",
			"schedule-one",
		);

		expect(scriptCommand).toContain("mkdir -p '/srv schedules/schedule-one'");
		expect(scriptCommand).toContain("printf %s");
		expect(scriptCommand).not.toContain("echo 'done'; touch /tmp/pwn");
		expect(deleteCommand).toBe("rm -rf -- '/srv schedules/schedule-one'");
		expect(() =>
			buildDeleteScheduleCommand("/srv schedules", "schedule;id"),
		).toThrow("Invalid schedule app name");
	});

	it("rejects dot-segment schedule app names before filesystem path building", () => {
		for (const appName of [".", ".."]) {
			expect(() => getScheduleDirectory("/srv schedules", appName)).toThrow(
				"Invalid schedule app name",
			);
			expect(() =>
				buildScheduleScriptCommand("/srv schedules", {
					appName,
					scheduleId: "schedule-1",
					script: "echo ok",
				} as never),
			).toThrow("Invalid schedule app name");
			expect(() =>
				buildDeleteScheduleCommand("/srv schedules", appName),
			).toThrow("Invalid schedule app name");
			expect(() =>
				getScheduleDeploymentLogPath(
					"/srv schedules",
					appName,
					"2026-06-26:12:00:00",
				),
			).toThrow("Invalid schedule app name");
		}
	});

	it("builds schedule deployment logs inside the schedule base directory", () => {
		expect(getScheduleDirectory("/srv schedules", "schedule.one_2-test")).toBe(
			"/srv schedules/schedule.one_2-test",
		);
		expect(getScheduleDirectory("/srv schedules", "..name")).toBe(
			"/srv schedules/..name",
		);
		expect(getScheduleDirectory("/srv schedules", "...")).toBe(
			"/srv schedules/...",
		);
		expect(
			getScheduleDeploymentLogPath(
				"/srv schedules",
				"schedule-one",
				"2026-06-26:12:00:00",
			),
		).toBe("/srv schedules/schedule-one/schedule-one-2026-06-26:12:00:00.log");
	});
});
