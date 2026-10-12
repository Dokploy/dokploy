import { createPreviewDeployment } from "@dokploy/server/services/preview-deployment";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findApplicationById: vi.fn(),
	createDomain: vi.fn(),
	manageDomain: vi.fn(),
	createComment: vi.fn(),
	getWebServerSettings: vi.fn(),
}));

vi.mock("@dokploy/server/db/schema", () => ({
	deployments: {},
	previewDeployments: { previewDeploymentId: "previewDeploymentId" },
}));
vi.mock("@dokploy/server/templates", () => ({
	generatePassword: () => "abc123",
}));
vi.mock("@dokploy/server/utils/docker/utils", () => ({
	removeService: vi.fn(),
}));
vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryCode: vi.fn(),
}));
vi.mock("@dokploy/server/utils/providers/github", () => ({
	authGithub: () => ({
		rest: { issues: { createComment: mocks.createComment } },
	}),
}));
vi.mock("@dokploy/server/utils/traefik/application", () => ({
	removeTraefikConfig: vi.fn(),
}));
vi.mock("@dokploy/server/utils/traefik/domain", () => ({
	manageDomain: mocks.manageDomain,
}));
vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: mocks.findApplicationById,
}));
vi.mock("@dokploy/server/services/deployment", () => ({
	removeDeploymentsByPreviewDeploymentId: vi.fn(),
}));
vi.mock("@dokploy/server/services/domain", () => ({
	createDomain: mocks.createDomain,
}));
vi.mock("@dokploy/server/services/github", () => ({
	findGithubById: vi.fn().mockResolvedValue({}),
	getIssueComment: (_name: string, _status: string, url: string) => url,
}));
vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: mocks.getWebServerSettings,
}));

const request = {
	applicationId: "app-id",
	branch: "feature/Dark_Mode",
	pullRequestId: "pr-id",
	// Webhooks pass the numeric GitHub payload directly to this service.
	pullRequestNumber: 42 as unknown as string,
	pullRequestURL: "https://github.com/owner/repo/pull/42",
	pullRequestTitle: "Add Dark Mode",
};

describe("createPreviewDeployment domain templates", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createComment.mockResolvedValue({ data: { id: 123 } });
		mocks.createDomain.mockImplementation(async (domain) => ({
			...domain,
			domainId: "domain-id",
		}));
		mocks.getWebServerSettings.mockResolvedValue({ serverIp: "192.0.2.10" });
	});

	it.each([
		["pr-{pr_num}.example.com", "pr-42.example.com"],
		["{pr_num}-{pr_name}.example.com", "42-add-dark-mode.example.com"],
		["{branch}-{pr_num}.example.com", "feature-dark-mode-42.example.com"],
		["{app_name}.example.com", "preview-web-abc123.example.com"],
		["*.example.com", "preview-web-abc123.example.com"],
		["*.sslip.io", "preview-web-abc123-192-0-2-10.sslip.io"],
	])("creates a domain and GitHub comment for %s", async (template, host) => {
		mocks.findApplicationById.mockResolvedValue({
			appName: "web",
			name: "Web",
			previewWildcard: template,
			previewHttps: true,
			previewPath: "/",
			previewPort: 3000,
			previewCertificateType: "letsencrypt",
			githubId: "github-id",
			owner: "owner",
			repository: "repo",
			server: { ipAddress: "192.0.2.10" },
		});

		await expect(createPreviewDeployment(request)).resolves.toBeDefined();
		expect(mocks.createDomain).toHaveBeenCalledWith(
			expect.objectContaining({ host, https: true, domainType: "preview" }),
		);
		expect(mocks.createComment).toHaveBeenCalledWith(
			expect.objectContaining({
				issue_number: 42,
				body: `### Dokploy Preview Deployment\n\nhttps://${host}`,
			}),
		);
		expect(mocks.manageDomain).toHaveBeenCalledWith(
			expect.objectContaining({ appName: "preview-web-abc123" }),
			expect.objectContaining({ host }),
		);
	});
});
