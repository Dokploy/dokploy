import { beforeEach, describe, expect, it, vi } from "vitest";

const chain = vi.hoisted(() => {
	const chain: any = {
		set: vi.fn(() => chain),
		values: vi.fn(() => chain),
		where: vi.fn(() => chain),
		returning: vi.fn(),
	};
	return chain;
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		insert: vi.fn(() => chain),
		update: vi.fn(() => chain),
		query: {
			applications: { findFirst: vi.fn() },
			organization: { findFirst: vi.fn() },
			previewDeployments: { findFirst: vi.fn() },
		},
	},
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
}));

vi.mock("@dokploy/server/services/domain", () => ({
	createDomain: vi.fn(async (domain: Record<string, unknown>) => ({
		...domain,
		domainId: "domain-1",
	})),
	findDomainById: vi.fn(),
	updateDomainById: vi.fn(),
}));

vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: vi.fn(),
	removeDomain: vi.fn(),
}));

vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: vi.fn(),
	getIssueComment: vi.fn(),
}));

vi.mock("@dokploy/server/utils/providers/github", () => ({
	authGithub: vi.fn(),
}));

import { db } from "@dokploy/server/db";
import { findApplicationById } from "@dokploy/server/services/application";
import { createDomain } from "@dokploy/server/services/domain";
import { findGithubById } from "@dokploy/server/services/github";
import {
	getImageRepository,
	upsertPreviewDeploymentFromImage,
} from "@dokploy/server/services/preview-deployment";
import { authGithub } from "@dokploy/server/utils/providers/github";

const PREVIEW_IMAGE = "ghcr.io/acme/web:pr-7";

const mockApplication = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "app-1",
	name: "Web",
	appName: "web-abc",
	sourceType: "docker",
	dockerImage: "ghcr.io/acme/web:latest",
	githubId: null,
	isPreviewDeploymentsActive: true,
	previewLimit: 3,
	previewDeployments: [],
	previewWildcard: "*.preview.example.com",
	previewPath: "/",
	previewPort: 3000,
	previewHttps: true,
	previewCertificateType: "letsencrypt",
	previewCustomCertResolver: null,
	previewForwardAuthEnabled: false,
	server: null,
	environment: { project: { organizationId: "org-1" } },
	...overrides,
});

const existingPreview = {
	previewDeploymentId: "preview-1",
	applicationId: "app-1",
	pullRequestNumber: "7",
	dockerImage: "ghcr.io/acme/web:pr-7-old",
};

const input = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "app-1",
	dockerImage: PREVIEW_IMAGE,
	pullRequestNumber: "7",
	...overrides,
});

const setup = (
	overrides: Record<string, unknown> = {},
	existing: typeof existingPreview | undefined = undefined,
) => {
	vi.mocked(findApplicationById).mockResolvedValue(
		mockApplication(overrides) as any,
	);
	vi.mocked(db.query.previewDeployments.findFirst)
		.mockReset()
		.mockResolvedValueOnce(existing as any)
		.mockResolvedValue({
			...existingPreview,
			domain: { host: "preview.example.com", https: true, path: "/" },
		} as any);
	vi.mocked(db.query.applications.findFirst).mockResolvedValue({
		previewForwardAuthEnabled: false,
	} as any);
	chain.returning.mockResolvedValue([{ previewDeploymentId: "preview-1" }]);
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("creating a preview deployment from an image", () => {
	it("creates the preview for a new pull request without calling GitHub", async () => {
		setup();

		const preview = await upsertPreviewDeploymentFromImage(
			input({ pullRequestTitle: "Add pricing page" }),
		);

		expect(preview.previewDeploymentId).toBe("preview-1");
		const values = chain.values.mock.calls[0][0];
		expect(values).toMatchObject({
			applicationId: "app-1",
			dockerImage: PREVIEW_IMAGE,
			pullRequestNumber: "7",
			pullRequestTitle: "Add pricing page",
			pullRequestCommentId: "",
		});
		expect(values.appName).toMatch(/^preview-web-abc-/);
		expect(vi.mocked(createDomain).mock.calls[0]?.[0]).toMatchObject({
			host: `${values.appName}.preview.example.com`,
			domainType: "preview",
			port: 3000,
			https: true,
		});
		expect(findGithubById).not.toHaveBeenCalled();
		expect(authGithub).not.toHaveBeenCalled();
	});

	it("updates the image of an existing preview instead of creating one", async () => {
		const previews = Array.from({ length: 3 }, () => existingPreview);
		setup({ previewDeployments: previews }, existingPreview);

		await upsertPreviewDeploymentFromImage(input());

		expect(db.insert).not.toHaveBeenCalled();
		expect(createDomain).not.toHaveBeenCalled();
		expect(chain.set.mock.calls[0][0]).toEqual({
			dockerImage: PREVIEW_IMAGE,
		});
	});

	it("accepts a digest of the application repository", async () => {
		setup();

		await expect(
			upsertPreviewDeploymentFromImage(
				input({ dockerImage: "ghcr.io/acme/web@sha256:abc123" }),
			),
		).resolves.toMatchObject({ previewDeploymentId: "preview-1" });
	});

	it.each([
		["the application is not a Docker application", { sourceType: "github" }],
		["preview deployments are disabled", { isPreviewDeploymentsActive: false }],
		["the application has no image yet", { dockerImage: null }],
	])("rejects the request when %s", async (_, overrides) => {
		setup(overrides);

		await expect(
			upsertPreviewDeploymentFromImage(input()),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(db.insert).not.toHaveBeenCalled();
	});

	it.each([
		"ghcr.io/other/web:pr-7",
		"ghcr.io/acme/web-evil:pr-7",
		"docker.io/acme/web:pr-7",
	])(
		"rejects %s, which is outside the application repository",
		async (image) => {
			setup();

			await expect(
				upsertPreviewDeploymentFromImage(input({ dockerImage: image })),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(db.insert).not.toHaveBeenCalled();
		},
	);

	it("rejects a new preview when the preview limit is reached", async () => {
		setup({
			previewLimit: 1,
			previewDeployments: [{ ...existingPreview, pullRequestNumber: "6" }],
		});

		await expect(
			upsertPreviewDeploymentFromImage(input()),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(db.insert).not.toHaveBeenCalled();
	});
});

describe("getImageRepository", () => {
	it.each([
		["nginx", "nginx"],
		["nginx:alpine", "nginx"],
		["ghcr.io/acme/web:pr-7", "ghcr.io/acme/web"],
		["ghcr.io/acme/web@sha256:abc", "ghcr.io/acme/web"],
		["ghcr.io/acme/web:pr-7@sha256:abc", "ghcr.io/acme/web"],
		["localhost:5000/web", "localhost:5000/web"],
		["localhost:5000/web:pr-7", "localhost:5000/web"],
	])("%s -> %s", (image, repository) => {
		expect(getImageRepository(image)).toBe(repository);
	});
});
