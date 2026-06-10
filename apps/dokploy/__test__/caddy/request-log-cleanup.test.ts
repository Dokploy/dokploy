import { beforeEach, expect, test, vi } from "vitest";

const existsSyncMock = vi.hoisted(() => vi.fn());
const execAsyncMock = vi.hoisted(() => vi.fn());
const getWebServerSettingsMock = vi.hoisted(() => vi.fn());
const updateWebServerSettingsMock = vi.hoisted(() => vi.fn());
const resolveWebServerProviderMock = vi.hoisted(() => vi.fn());
const scheduleJobMock = vi.hoisted(() => vi.fn());
const scheduledJobsMock = vi.hoisted(() => ({}) as Record<string, any>);
let scheduledCallback: (() => Promise<void>) | undefined;

vi.mock("node:fs", () => ({
	default: {
		existsSync: existsSyncMock,
	},
	existsSync: existsSyncMock,
}));

vi.mock("node-schedule", () => ({
	scheduledJobs: scheduledJobsMock,
	scheduleJob: scheduleJobMock,
}));

vi.mock("@dokploy/server/constants", () => ({
	ACCESS_LOG_RETAINED_LINES: 1000,
	paths: () => ({
		DYNAMIC_TRAEFIK_PATH: "/etc/dokploy/traefik/dynamic",
		CADDY_ACCESS_LOG_PATH: "/etc/dokploy/caddy/access.log",
	}),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: getWebServerSettingsMock,
	updateWebServerSettings: updateWebServerSettingsMock,
	resolveWebServerProvider: resolveWebServerProviderMock,
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: execAsyncMock,
}));

import { startLogCleanup } from "@dokploy/server/utils/access-log/handler";

beforeEach(() => {
	vi.clearAllMocks();
	for (const key of Object.keys(scheduledJobsMock)) {
		delete scheduledJobsMock[key];
	}
	scheduledCallback = undefined;
	existsSyncMock.mockReturnValue(true);
	execAsyncMock.mockResolvedValue({ stdout: "", stderr: "" });
	updateWebServerSettingsMock.mockResolvedValue({});
	scheduleJobMock.mockImplementation((name, _cron, callback) => {
		if (name === "access-log-cleanup") {
			scheduledCallback = callback;
		}
		return { cancel: vi.fn() };
	});
});

test("keeps Traefik access-log cleanup and signal behavior", async () => {
	resolveWebServerProviderMock.mockResolvedValue("traefik");

	await startLogCleanup("0 0 * * *");
	await scheduledCallback?.();

	expect(execAsyncMock).toHaveBeenNthCalledWith(
		1,
		"tail -n 1000 /etc/dokploy/traefik/dynamic/access.log > /etc/dokploy/traefik/dynamic/access.log.tmp && mv /etc/dokploy/traefik/dynamic/access.log.tmp /etc/dokploy/traefik/dynamic/access.log",
	);
	expect(execAsyncMock).toHaveBeenNthCalledWith(
		2,
		"docker exec dokploy-traefik kill -USR1 1",
	);
});

test("cleans Caddy access logs without signaling Traefik", async () => {
	resolveWebServerProviderMock.mockResolvedValue("caddy");

	await startLogCleanup("0 0 * * *");
	await scheduledCallback?.();

	expect(execAsyncMock).toHaveBeenCalledTimes(1);
	expect(execAsyncMock).toHaveBeenCalledWith(
		"tail -n 1000 /etc/dokploy/caddy/access.log > /etc/dokploy/caddy/access.log.tmp && cat /etc/dokploy/caddy/access.log.tmp > /etc/dokploy/caddy/access.log && rm /etc/dokploy/caddy/access.log.tmp",
	);
	expect(execAsyncMock).not.toHaveBeenCalledWith(
		"docker exec dokploy-traefik kill -USR1 1",
	);
});

test("does not persist invalid cleanup cron schedules", async () => {
	const existingCancel = vi.fn();
	scheduledJobsMock["access-log-cleanup"] = { cancel: existingCancel };
	scheduleJobMock.mockReturnValueOnce(null);

	const result = await startLogCleanup("not a cron");

	expect(result).toBe(false);
	expect(existingCancel).not.toHaveBeenCalled();
	expect(updateWebServerSettingsMock).not.toHaveBeenCalled();
});
