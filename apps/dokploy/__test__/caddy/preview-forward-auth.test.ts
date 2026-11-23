import {
	enableForwardAuthOnDomain,
	setPreviewForwardAuth,
} from "@dokploy/server/services/proprietary/forward-auth";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getWebServerProvider: vi.fn(async () => "caddy"),
	findApplicationById: vi.fn(async () => ({ serverId: "remote-caddy" })),
	updateApplication: vi.fn(),
	findDomainById: vi.fn(async () => ({
		applicationId: "app",
		domainType: "application",
	})),
	updateDomainById: vi.fn(),
	findPreviewDeploymentsByApplicationId: vi.fn(async () => []),
	applyPreviewForwardAuth: vi.fn(),
	findAuthSettings: vi.fn(),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerProvider: mocks.getWebServerProvider,
}));
vi.mock("@dokploy/server/db", () => ({
	db: { query: { forwardAuthSettings: { findFirst: mocks.findAuthSettings } } },
}));
vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
	updateApplication: mocks.updateApplication,
}));
vi.mock("@dokploy/server/services/domain", () => ({
	findDomainById: mocks.findDomainById,
	updateDomainById: mocks.updateDomainById,
}));
vi.mock("@dokploy/server/services/preview-deployment", () => ({
	findPreviewDeploymentsByApplicationId:
		mocks.findPreviewDeploymentsByApplicationId,
	applyPreviewForwardAuth: mocks.applyPreviewForwardAuth,
}));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getWebServerProvider.mockResolvedValue("caddy");
});

it("refuses preview SSO on Caddy before saving the application or touching previews", async () => {
	await expect(
		setPreviewForwardAuth({ applicationId: "app", enabled: true }),
	).rejects.toThrow("Forward auth");
	expect(mocks.getWebServerProvider).toHaveBeenCalledWith("remote-caddy");
	expect(mocks.findAuthSettings).not.toHaveBeenCalled();
	expect(mocks.updateApplication).not.toHaveBeenCalled();
	expect(mocks.findPreviewDeploymentsByApplicationId).not.toHaveBeenCalled();
	expect(mocks.applyPreviewForwardAuth).not.toHaveBeenCalled();
});

it("refuses domain SSO on Caddy before saving the domain", async () => {
	await expect(
		enableForwardAuthOnDomain({ domainId: "domain" }),
	).rejects.toThrow("Forward auth");
	expect(mocks.updateDomainById).not.toHaveBeenCalled();
	expect(mocks.findAuthSettings).not.toHaveBeenCalled();
});

it("still allows disabling preview SSO on Caddy", async () => {
	await setPreviewForwardAuth({ applicationId: "app", enabled: false });
	expect(mocks.updateApplication).toHaveBeenCalledWith("app", {
		previewForwardAuthEnabled: false,
	});
});

it("retains upstream authentication-proxy readiness checks on Traefik", async () => {
	mocks.getWebServerProvider.mockResolvedValue("traefik");
	await expect(
		setPreviewForwardAuth({ applicationId: "app", enabled: true }),
	).rejects.toThrow("Deploy the authentication proxy");
	expect(mocks.findAuthSettings).toHaveBeenCalled();
	expect(mocks.updateApplication).not.toHaveBeenCalled();
});
