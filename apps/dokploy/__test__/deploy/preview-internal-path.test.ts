import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/db", () => {
	const chain: any = {
		set: vi.fn(() => chain),
		values: vi.fn(() => chain),
		where: vi.fn(() => chain),
		returning: vi.fn().mockResolvedValue([{ previewDeploymentId: "pd-1" }]),
	};
	return {
		db: {
			insert: vi.fn(() => chain),
			update: vi.fn(() => chain),
			query: {
				organization: {
					findFirst: vi.fn().mockResolvedValue({ ownerId: "o" }),
				},
				applications: { findFirst: vi.fn().mockResolvedValue(null) },
			},
		},
	};
});

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
}));

vi.mock("@dokploy/server/services/domain", () => ({
	createDomain: vi.fn().mockResolvedValue({ domainId: "d-1" }),
	findDomainById: vi.fn(),
	updateDomainById: vi.fn(),
}));

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: vi.fn().mockResolvedValue({}),
	getIssueComment: vi.fn().mockReturnValue(""),
}));

vi.mock("@dokploy/server/utils/providers/github", () => ({
	authGithub: vi.fn(() => ({
		rest: {
			issues: { createComment: vi.fn().mockResolvedValue({ data: { id: 1 } }) },
		},
	})),
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: vi.fn(),
	removeDomain: vi.fn(),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(),
}));

import { findApplicationById } from "@dokploy/server/services/application";
import { createDomain } from "@dokploy/server/services/domain";
import { createPreviewDeployment } from "@dokploy/server/services/preview-deployment";

const makeApp = (previewInternalPath: string | null) =>
	({
		appName: "app",
		name: "app",
		githubId: "g-1",
		owner: "o",
		repository: "r",
		previewWildcard: "*.example.com",
		previewPath: "/",
		previewInternalPath,
		previewPort: 3000,
		previewHttps: false,
		previewCertificateType: "none",
		previewCustomCertResolver: null,
		previewForwardAuthEnabled: false,
		environment: { project: { organizationId: "org" } },
		server: null,
	}) as any;

describe("createPreviewDeployment internal path", () => {
	beforeEach(() => vi.clearAllMocks());

	it("passes the configured internal path to the preview domain", async () => {
		vi.mocked(findApplicationById).mockResolvedValue(makeApp("/app"));
		await createPreviewDeployment({
			applicationId: "a",
			pullRequestNumber: "1",
		} as any);
		expect(createDomain).toHaveBeenCalledWith(
			expect.objectContaining({ internalPath: "/app", domainType: "preview" }),
		);
	});
});
