import type { Domain } from "@dokploy/server/services/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.hoisted(() => vi.fn());
const mockReturning = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			notifications: { findMany: mockFindMany },
			domains: { findFirst: vi.fn(async () => ({})) },
		},
		update: () => ({
			set: () => ({ where: () => ({ returning: mockReturning }) }),
		}),
		delete: () => ({ where: () => ({ returning: mockReturning }) }),
	},
}));

const mockFindApplicationById = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mockFindApplicationById,
}));

const mockFindComposeById = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: mockFindComposeById,
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

import { apiCreateSlack } from "@dokploy/server/db/schema";
import {
	removeDomainById,
	updateDomainById,
} from "@dokploy/server/services/domain";
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

const service = {
	name: "frontend",
	environment: {
		name: "production",
		project: { name: "shop", organizationId: "org-1" },
	},
};

beforeEach(() => {
	vi.clearAllMocks();
	mockFindMany.mockResolvedValue([customNotification]);
	mockFindApplicationById.mockResolvedValue(service);
	mockFindComposeById.mockResolvedValue(service);
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

describe("domain service notifications", () => {
	it("notifies when a domain is updated", async () => {
		mockReturning.mockResolvedValue([{ ...baseDomain, enabled: false }]);

		await updateDomainById("domain-1", { enabled: false });

		await vi.waitFor(() =>
			expect(sentPayload()).toMatchObject({
				event: "updated",
				enabled: false,
				serviceName: "frontend",
				projectName: "shop",
			}),
		);
		expect(mockFindApplicationById).toHaveBeenCalledWith("app-1");
	});

	it("resolves compose domains through the compose", async () => {
		mockReturning.mockResolvedValue([
			{
				...baseDomain,
				domainType: "compose",
				applicationId: null,
				composeId: "compose-1",
			},
		]);

		await removeDomainById("domain-1");

		await vi.waitFor(() =>
			expect(sentPayload()).toMatchObject({
				event: "removed",
				serviceType: "compose",
			}),
		);
		expect(mockFindComposeById).toHaveBeenCalledWith("compose-1");
	});

	it("does not wait for notification delivery", async () => {
		mockReturning.mockResolvedValue([baseDomain]);
		mockSendCustomNotification.mockReturnValue(new Promise(() => {}));

		await expect(removeDomainById("domain-1")).resolves.toMatchObject({
			domainId: "domain-1",
		});
	});

	it("skips preview deployment domains", async () => {
		mockReturning.mockResolvedValue([
			{
				...baseDomain,
				domainType: "preview",
				applicationId: null,
				previewDeploymentId: "preview-1",
			},
		]);

		await removeDomainById("domain-1");
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockFindApplicationById).not.toHaveBeenCalled();
		expect(mockFindMany).not.toHaveBeenCalled();
	});
});

describe("notification create schemas", () => {
	it("accept requests that omit domainChanged", () => {
		const result = apiCreateSlack.safeParse({
			name: "Slack",
			webhookUrl: "https://hooks.slack.test",
			channel: "#alerts",
			appDeploy: true,
			appBuildError: false,
			databaseBackup: false,
			dokployBackup: false,
			volumeBackup: false,
			dokployRestart: false,
			dockerCleanup: false,
			serverThreshold: false,
		});

		expect(result.success).toBe(true);
	});
});
