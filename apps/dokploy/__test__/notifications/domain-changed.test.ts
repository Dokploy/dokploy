import type { Domain } from "@dokploy/server/services/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/db", () => ({
	db: { query: { notifications: { findMany: mockFindMany } } },
}));

const mockSendCustomNotification = vi.hoisted(() => vi.fn());
vi.mock(
	"@dokploy/server/utils/notifications/utils",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@dokploy/server/utils/notifications/utils")
		>()),
		sendCustomNotification: mockSendCustomNotification,
	}),
);

import { sendDomainChangedNotifications } from "@dokploy/server/utils/notifications/domain-changed";

const baseDomain: Domain = {
	domainId: "domain-1",
	host: "app.example.com",
	https: true,
	port: 8080,
	customEntrypoint: null,
	path: "/",
	serviceName: null,
	domainType: "application",
	uniqueConfigKey: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	composeId: null,
	customCertResolver: null,
	applicationId: "app-1",
	previewDeploymentId: null,
	certificateType: "letsencrypt",
	internalPath: "/",
	stripPath: false,
	middlewares: [],
	forwardAuthEnabled: false,
	enabled: true,
};

const baseProps = {
	domain: baseDomain,
	projectName: "shop",
	serviceName: "frontend",
	serviceType: "application" as const,
	environmentName: "production",
	organizationId: "org-1",
};

const customNotification = {
	custom: { customId: "custom-1", endpoint: "https://hooks.test", headers: {} },
};

const sentPayload = () => mockSendCustomNotification.mock.calls[0]?.[1];

beforeEach(() => {
	vi.clearAllMocks();
	mockFindMany.mockResolvedValue([customNotification]);
});

describe("sendDomainChangedNotifications", () => {
	it("sends a structured payload to custom webhooks", async () => {
		await sendDomainChangedNotifications({ ...baseProps, event: "created" });

		expect(mockSendCustomNotification).toHaveBeenCalledTimes(1);
		expect(sentPayload()).toMatchObject({
			title: "Domain Added",
			event: "created",
			type: "domain",
			domainId: "domain-1",
			host: "app.example.com",
			url: "https://app.example.com",
			https: true,
			path: "/",
			port: 8080,
			enabled: true,
			projectName: "shop",
			serviceName: "frontend",
			serviceType: "application",
			environmentName: "production",
		});
	});

	it.each([
		["updated", "Domain Updated"],
		["removed", "Domain Removed"],
	] as const)("titles the %s event", async (event, title) => {
		await sendDomainChangedNotifications({ ...baseProps, event });

		expect(sentPayload()).toMatchObject({ event, title });
	});

	it("includes a non-root path in the url and respects http", async () => {
		await sendDomainChangedNotifications({
			...baseProps,
			event: "updated",
			domain: { ...baseDomain, https: false, path: "/api" },
		});

		expect(sentPayload()).toMatchObject({ url: "http://app.example.com/api" });
	});

	it("reports a disabled domain", async () => {
		await sendDomainChangedNotifications({
			...baseProps,
			event: "updated",
			domain: { ...baseDomain, enabled: false },
		});

		expect(sentPayload()).toMatchObject({ enabled: false });
	});

	it("keeps notifying when one provider fails", async () => {
		mockFindMany.mockResolvedValue([customNotification, customNotification]);
		mockSendCustomNotification.mockRejectedValueOnce(new Error("boom"));
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await sendDomainChangedNotifications({ ...baseProps, event: "created" });

		expect(mockSendCustomNotification).toHaveBeenCalledTimes(2);
		consoleLog.mockRestore();
	});
});
