import { beforeEach, expect, test, vi } from "vitest";

const previewDeploymentRow = {
	previewDeploymentId: "preview-1",
	applicationId: "app-1",
	appName: "preview-my-app-fixedpw",
	pullRequestCommentId: "comment-1",
	domainId: null,
};

const insertedPreviewDeployment = { ...previewDeploymentRow };

const dbMock = vi.hoisted(() => ({
	query: {
		organization: { findFirst: vi.fn() },
		previewDeployments: { findFirst: vi.fn() },
	},
	insert: vi.fn(),
	update: vi.fn(),
	delete: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: dbMock,
}));

vi.mock("@dokploy/server/templates", () => ({
	generatePassword: vi.fn(() => "fixedpw"),
}));

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
}));

vi.mock("@dokploy/server/services/deployment", () => ({
	removeDeploymentsByPreviewDeploymentId: vi.fn(),
}));

vi.mock("@dokploy/server/services/domain", () => ({
	createDomain: vi.fn(),
	removeDomainById: vi.fn(),
}));

vi.mock("@dokploy/server/services/github", () => ({
	getIssueComment: vi.fn(() => "preview comment"),
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(),
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	removeService: vi.fn(),
}));

vi.mock("@dokploy/server/utils/filesystem/directory", () => ({
	removeDirectoryCode: vi.fn(),
}));

const createCommentMock = vi.hoisted(() => vi.fn());
const deleteCommentMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/utils/providers/github", () => ({
	authGithub: vi.fn(() => ({
		rest: {
			issues: {
				createComment: createCommentMock,
				deleteComment: deleteCommentMock,
			},
		},
	})),
}));

vi.mock("@dokploy/server/utils/traefik/application", () => ({
	removeTraefikConfig: vi.fn(),
}));

vi.mock("@dokploy/server/utils/web-server/domain", () => ({
	manageWebServerDomain: vi.fn(),
	removeWebServerDomain: vi.fn(),
}));

import { findApplicationById } from "@dokploy/server/services/application";
import {
	createDomain,
	removeDomainById,
} from "@dokploy/server/services/domain";
import {
	createPreviewDeployment,
	removePreviewDeployment,
} from "@dokploy/server/services/preview-deployment";
import {
	manageWebServerDomain,
	removeWebServerDomain,
} from "@dokploy/server/utils/web-server/domain";

const createApplication = () => ({
	applicationId: "app-1",
	appName: "my-app",
	name: "My App",
	owner: "dokploy",
	repository: "dokploy",
	github: {},
	serverId: null,
	server: {
		ipAddress: "192.0.2.10",
	},
	previewWildcard: "*.sslip.io",
	previewPath: "/",
	previewPort: 3000,
	previewHttps: true,
	previewCertificateType: "letsencrypt",
	previewCustomCertResolver: null,
	environment: {
		project: {
			organizationId: "org-1",
		},
	},
});

beforeEach(() => {
	vi.clearAllMocks();
	Object.assign(insertedPreviewDeployment, previewDeploymentRow);
	dbMock.query.organization.findFirst.mockResolvedValue({ ownerId: "user-1" });
	createCommentMock.mockResolvedValue({ data: { id: 12345 } });
	dbMock.insert.mockReturnValue({
		values: vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([insertedPreviewDeployment]),
		}),
	});
	dbMock.update.mockReturnValue({
		set: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue([]),
		}),
	});
	dbMock.delete.mockReturnValue({
		where: vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([]),
		}),
	});
	vi.mocked(removeDomainById).mockResolvedValue(undefined as never);
	vi.mocked(removeWebServerDomain).mockResolvedValue(undefined as never);
	deleteCommentMock.mockResolvedValue(undefined);
});

test("creates preview domains through the active web server provider", async () => {
	const application = createApplication();
	const domain = {
		domainId: "domain-1",
		host: "preview-my-app-fixedpw-192-0-2-10.sslip.io",
		uniqueConfigKey: 17,
	};
	vi.mocked(findApplicationById).mockResolvedValue(application as never);
	vi.mocked(createDomain).mockResolvedValue(domain as never);

	await createPreviewDeployment({
		applicationId: "app-1",
		pullRequestId: "pr-1",
		pullRequestNumber: "42",
		branch: "feature/caddy-preview",
	} as never);

	expect(createDomain).toHaveBeenCalledWith(
		expect.objectContaining({
			host: "preview-my-app-fixedpw-192-0-2-10.sslip.io",
			path: "/",
			port: 3000,
			https: true,
			certificateType: "letsencrypt",
			domainType: "preview",
			previewDeploymentId: "preview-1",
		}),
	);
	expect(manageWebServerDomain).toHaveBeenCalledWith(
		expect.objectContaining({
			applicationId: "app-1",
			appName: "preview-my-app-fixedpw",
		}),
		domain,
	);
});

test("cleans up preview domain state when provider route creation fails", async () => {
	const application = createApplication();
	const domain = {
		domainId: "domain-1",
		host: "preview-my-app-fixedpw-192-0-2-10.sslip.io",
		uniqueConfigKey: 17,
	};
	vi.mocked(findApplicationById).mockResolvedValue(application as never);
	vi.mocked(createDomain).mockResolvedValue(domain as never);
	vi.mocked(manageWebServerDomain).mockRejectedValueOnce(
		new Error("caddy reload failed") as never,
	);

	await expect(
		createPreviewDeployment({
			applicationId: "app-1",
			pullRequestId: "pr-1",
			pullRequestNumber: "42",
			branch: "feature/caddy-preview",
		} as never),
	).rejects.toThrow("caddy reload failed");

	expect(removeDomainById).toHaveBeenCalledWith("domain-1");
	expect(removeWebServerDomain).not.toHaveBeenCalled();
	expect(dbMock.delete).toHaveBeenCalled();
	expect(deleteCommentMock).toHaveBeenCalledWith(
		expect.objectContaining({
			owner: "dokploy",
			repo: "dokploy",
			comment_id: 12345,
		}),
	);
});

test("removes preview routes when preview domain linking fails after route creation", async () => {
	const application = createApplication();
	const domain = {
		domainId: "domain-1",
		host: "preview-my-app-fixedpw-192-0-2-10.sslip.io",
		uniqueConfigKey: 17,
	};
	vi.mocked(findApplicationById).mockResolvedValue(application as never);
	vi.mocked(createDomain).mockResolvedValue(domain as never);
	dbMock.update.mockReturnValueOnce({
		set: vi.fn().mockReturnValue({
			where: vi.fn().mockRejectedValue(new Error("db update failed")),
		}),
	});

	await expect(
		createPreviewDeployment({
			applicationId: "app-1",
			pullRequestId: "pr-1",
			pullRequestNumber: "42",
			branch: "feature/caddy-preview",
		} as never),
	).rejects.toThrow("db update failed");

	expect(removeWebServerDomain).toHaveBeenCalledWith(
		expect.objectContaining({
			appName: "preview-my-app-fixedpw",
		}),
		17,
	);
	expect(removeDomainById).toHaveBeenCalledWith("domain-1");
	expect(dbMock.delete).toHaveBeenCalled();
});

test("removes preview domains through the active web server provider", async () => {
	const application = createApplication();
	vi.mocked(findApplicationById).mockResolvedValue(application as never);
	dbMock.query.previewDeployments.findFirst.mockResolvedValue({
		...previewDeploymentRow,
		domain: {
			domainId: "domain-1",
			uniqueConfigKey: 17,
		},
		application: {
			applicationId: "app-1",
			serverId: null,
		},
	});

	await removePreviewDeployment("preview-1");

	expect(removeWebServerDomain).toHaveBeenCalledWith(
		expect.objectContaining({
			applicationId: "app-1",
			appName: "preview-my-app-fixedpw",
		}),
		17,
	);
});

test("keeps preview deployment row when provider route removal fails", async () => {
	const application = createApplication();
	vi.mocked(findApplicationById).mockResolvedValue(application as never);
	dbMock.query.previewDeployments.findFirst.mockResolvedValue({
		...previewDeploymentRow,
		domain: {
			domainId: "domain-1",
			uniqueConfigKey: 17,
		},
		application: {
			applicationId: "app-1",
			serverId: null,
		},
	});
	vi.mocked(removeWebServerDomain).mockRejectedValueOnce(
		new Error("caddy route cleanup failed") as never,
	);

	await expect(removePreviewDeployment("preview-1")).rejects.toThrow(
		"caddy route cleanup failed",
	);

	expect(dbMock.delete).not.toHaveBeenCalled();
});
