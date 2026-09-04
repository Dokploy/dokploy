import { db } from "@dokploy/server/db";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { sendServerThresholdNotifications } from "@dokploy/server/utils/notifications/server-threshold";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(),
	updateWebServerSettings: vi.fn(),
}));

vi.mock("@dokploy/server/utils/notifications/server-threshold", () => ({
	sendServerThresholdNotifications: vi.fn(),
}));

import { notificationRouter } from "@/server/api/routers/notification";

const buildCaller = () =>
	notificationRouter.createCaller({
		session: null,
		db,
		req: {} as any,
		res: {} as any,
		user: null,
	} as any);

const dokployInput = {
	ServerType: "Dokploy" as const,
	Type: "CPU" as const,
	Value: 91.5,
	Threshold: 80,
	Message: "CPU usage (91.50%) exceeded threshold (80.00%)",
	Timestamp: "2026-09-03T10:00:00.000Z",
	Token: "server-token",
};

const memberFindFirst = () => db.query.member.findFirst as any;

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(getWebServerSettings).mockResolvedValue({
		metricsConfig: { server: { token: "server-token" } },
	} as any);
	memberFindFirst().mockResolvedValue({
		organizationId: "org-123",
		organization: { id: "org-123" },
	});
});

describe("receiveNotification — self-hosted Dokploy branch", () => {
	it("resolves the admin's default organization and dispatches with a real organizationId", async () => {
		const caller = buildCaller();
		await caller.receiveNotification(dokployInput);

		expect(sendServerThresholdNotifications).toHaveBeenCalledTimes(1);
		expect(sendServerThresholdNotifications).toHaveBeenCalledWith(
			"org-123",
			expect.objectContaining({
				ServerName: "Dokploy",
				Type: "CPU",
				Value: 91.5,
				Threshold: 80,
				Token: "server-token",
			}),
		);
	});

	it("resolves the default membership with the same query shape as auth.ts session resolution", async () => {
		memberFindFirst().mockResolvedValue({
			organizationId: "default-org",
			organization: { id: "default-org" },
		});

		const caller = buildCaller();
		await caller.receiveNotification(dokployInput);

		expect(sendServerThresholdNotifications).toHaveBeenCalledWith(
			"default-org",
			expect.anything(),
		);
		expect(memberFindFirst()).toHaveBeenCalledTimes(1);
		const queryOpts = memberFindFirst().mock.calls[0][0];
		expect(queryOpts.orderBy).toHaveLength(2);
		expect(queryOpts.with).toEqual({ organization: true });
	});

	it("throws and does not dispatch when no organization membership exists", async () => {
		memberFindFirst().mockResolvedValue(undefined);

		const caller = buildCaller();
		await expect(
			caller.receiveNotification(dokployInput),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(sendServerThresholdNotifications).not.toHaveBeenCalled();
	});
});
