import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findMany: vi.fn(),
	findApplicationById: vi.fn(),
	updateDomainById: vi.fn(),
	manageDomain: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: { query: { previewDeployments: { findMany: mocks.findMany } } },
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));

vi.mock("@dokploy/server/services/domain", () => ({
	createDomain: vi.fn(),
	updateDomainById: mocks.updateDomainById,
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: mocks.manageDomain,
}));

const { syncPreviewNoIndex } = await import(
	"@dokploy/server/services/preview-deployment"
);

const preview = (appName: string, domainId: string, noIndex: boolean) => ({
	appName,
	domain: { domainId, noIndex },
});

describe("syncPreviewNoIndex", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findApplicationById.mockResolvedValue({ appName: "web" });
		mocks.updateDomainById.mockImplementation(
			async (domainId: string, data: { noIndex: boolean }) => ({
				domainId,
				...data,
			}),
		);
	});

	it("updates and re-applies only the previews whose setting differs", async () => {
		mocks.findMany.mockResolvedValue([
			preview("preview-web-aaa", "d1", false),
			preview("preview-web-bbb", "d2", true),
			{ appName: "preview-web-ccc", domain: null },
		]);

		await syncPreviewNoIndex("app-1", true);

		expect(mocks.updateDomainById).toHaveBeenCalledTimes(1);
		expect(mocks.updateDomainById).toHaveBeenCalledWith("d1", {
			noIndex: true,
		});
		expect(mocks.manageDomain).toHaveBeenCalledTimes(1);
		expect(mocks.manageDomain).toHaveBeenCalledWith(
			{ appName: "preview-web-aaa" },
			{ domainId: "d1", noIndex: true },
		);
	});

	it("does nothing when every preview already matches", async () => {
		mocks.findMany.mockResolvedValue([preview("preview-web-aaa", "d1", false)]);

		await syncPreviewNoIndex("app-1", false);

		expect(mocks.findApplicationById).not.toHaveBeenCalled();
		expect(mocks.updateDomainById).not.toHaveBeenCalled();
		expect(mocks.manageDomain).not.toHaveBeenCalled();
	});
});
